from app.models.db import Base
from app.models.generated_models import Documents as Document, ProcessingJobs as ProcessingJob

__all__ = ["Base", "Document", "ProcessingJob"]
