import re
from dataclasses import dataclass
from typing import List, Tuple
from app.utils.logger import logger

@dataclass
class Chunk:
    document_id: str
    session_id:  str
    chunk_index: int        # Sequential 0-based index within the document
    page_number: int        # Source page (from extraction stage)
    content:     str        # Chunk text
    token_count: int        # Approximate token count
    embedding:   List[float] = None

class ChunkerService:
    def __init__(self, target_size: int = 500, overlap: int = 75):
        self.target_size = target_size
        self.overlap = overlap

    def count_tokens(self, text: str) -> int:
        """Approximate token count based on whitespace split."""
        return len(text.split())

    def _split_into_units(self, text: str) -> List[dict]:
        """Split text into paragraph units, falling back to sentence units if they exceed target size."""
        # Split into paragraph units
        paragraphs = re.split(r'\n\s*\n', text)
        units = []

        for p in paragraphs:
            p_clean = p.strip()
            if not p_clean:
                continue

            p_tokens = self.count_tokens(p_clean)
            if p_tokens <= self.target_size:
                units.append({
                    "text": p_clean,
                    "token_count": p_tokens
                })
            else:
                # Paragraph exceeds target size, split into sentences
                sentences = re.split(r'(?<=[.!?])\s+', p_clean)
                for s in sentences:
                    s_clean = s.strip()
                    if not s_clean:
                        continue
                    
                    s_tokens = self.count_tokens(s_clean)
                    if s_tokens <= self.target_size:
                        units.append({
                            "text": s_clean,
                            "token_count": s_tokens
                        })
                    else:
                        # Sentence still exceeds target size (rare), split into words
                        words = s_clean.split()
                        for i in range(0, len(words), self.target_size):
                            sub_text = " ".join(words[i:i + self.target_size])
                            units.append({
                                "text": sub_text,
                                "token_count": self.count_tokens(sub_text)
                            })

        return units

    def chunk_document(
        self, 
        document_id: str, 
        session_id: str, 
        pages: List[Tuple[int, str]]
    ) -> List[Chunk]:
        """Chunk a document page-by-page, assigning a globally sequential chunk_index."""
        logger.info(
            f"[Chunker] Segmenting document into overlapping paragraph chunks",
            extra={"document_id": document_id, "pages_count": len(pages)}
        )

        chunks: List[Chunk] = []
        global_chunk_idx = 0

        for page_number, page_text in pages:
            if not page_text or not page_text.strip():
                continue

            # Split page text into paragraph or sentence units
            units = self._split_into_units(page_text)
            if not units:
                continue

            start_idx = 0
            while start_idx < len(units):
                end_idx = start_idx
                current_tokens = 0
                
                # Expand window until target_size is met
                while end_idx < len(units):
                    unit_tokens = units[end_idx]['token_count']
                    if current_tokens + unit_tokens > self.target_size:
                        # Ensure we include at least one unit
                        if end_idx == start_idx:
                            end_idx += 1
                        break
                    current_tokens += unit_tokens
                    end_idx += 1
                
                # Combine units in the window
                chunk_units = units[start_idx:end_idx]
                chunk_content = "\n".join(u['text'] for u in chunk_units)
                chunk_tokens = self.count_tokens(chunk_content)

                chunks.append(Chunk(
                    document_id=document_id,
                    session_id=session_id,
                    chunk_index=global_chunk_idx,
                    page_number=page_number,
                    content=chunk_content,
                    token_count=chunk_tokens
                ))
                global_chunk_idx += 1

                # Calculate start index of the next window to incorporate overlap
                next_start_idx = end_idx
                overlap_tokens = 0
                for i in range(end_idx - 1, start_idx, -1):
                    u_tokens = units[i]['token_count']
                    if overlap_tokens + u_tokens > self.overlap:
                        break
                    overlap_tokens += u_tokens
                    next_start_idx = i

                # Prevent infinite loops / make sure we progress by at least 1 unit
                if next_start_idx <= start_idx:
                    next_start_idx = start_idx + 1

                start_idx = next_start_idx

        logger.info(
            f"[Chunker] Completed document chunking",
            extra={"document_id": document_id, "total_chunks": len(chunks)}
        )
        return chunks
