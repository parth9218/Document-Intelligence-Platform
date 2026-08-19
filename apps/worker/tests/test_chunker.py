import unittest
from app.services.chunker import ChunkerService

class TestChunkerService(unittest.TestCase):
    def setUp(self):
        # Target size 10 words, overlap 2 words
        self.chunker = ChunkerService(target_size=10, overlap=2)

    def test_chunker_basic_paragraphs(self):
        pages = [
            (1, "Paragraph one is here.\n\nParagraph two is also here."),
            (2, "Paragraph three on page two.")
        ]
        chunks = self.chunker.chunk_document("doc-123", "sess-456", pages)

        # We should have 2 chunks since paragraphs on page 1 fit in a single chunk (4 + 5 = 9 words <= 10)
        self.assertEqual(len(chunks), 2)
        
        # Verify globally sequential chunk_index
        self.assertEqual(chunks[0].chunk_index, 0)
        self.assertEqual(chunks[1].chunk_index, 1)

        # Verify correct page numbers
        self.assertEqual(chunks[0].page_number, 1)
        self.assertEqual(chunks[1].page_number, 2)

        # Verify content
        self.assertEqual(chunks[0].content, "Paragraph one is here.\nParagraph two is also here.")
        self.assertEqual(chunks[1].content, "Paragraph three on page two.")

    def test_chunker_fallback_to_sentences(self):
        # One huge paragraph exceeding 10 words (16 words)
        pages = [
            (1, "This is a very long paragraph that has more than ten words in it for sure.")
        ]
        chunks = self.chunker.chunk_document("doc-123", "sess-456", pages)

        # Split into words:
        # Chunk 0: "This is a very long paragraph that has more than" (10 words)
        # Chunk 1: "ten words in it for sure." (6 words)
        
        self.assertEqual(len(chunks), 2)
        self.assertEqual(chunks[0].chunk_index, 0)
        self.assertEqual(chunks[1].chunk_index, 1)
        self.assertEqual(chunks[0].token_count, 10)
        self.assertEqual(chunks[1].token_count, 6)
        self.assertEqual(chunks[0].content, "This is a very long paragraph that has more than")
        self.assertEqual(chunks[1].content, "ten words in it for sure.")

    def test_chunker_multi_page_pdf(self):
        # 10 pages, each with a paragraph
        pages = [(i, f"This is page {i} content paragraph.") for i in range(1, 11)]
        chunks = self.chunker.chunk_document("doc-123", "sess-456", pages)

        self.assertEqual(len(chunks), 10)
        for idx, chunk in enumerate(chunks):
            self.assertEqual(chunk.chunk_index, idx)
            self.assertEqual(chunk.page_number, idx + 1)
            self.assertEqual(chunk.content, f"This is page {idx + 1} content paragraph.")

if __name__ == "__main__":
    unittest.main()
