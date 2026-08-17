import logging
import json
import os
import sys

class JsonFormatter(logging.Formatter):
    """Custom formatter to output logs in structured JSON format for production telemetry."""
    def format(self, record):
        log_data = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
        }
        # Inject standard contextual fields if present in record extra
        for field in ["job_id", "document_id", "session_id", "correlation_id"]:
            if hasattr(record, field):
                log_data[field] = getattr(record, field)
                
        # Inject any other extra dictionary properties
        if hasattr(record, "extra_fields"):
            log_data.update(record.extra_fields)
            
        return json.dumps(log_data)

# Global logger instance
logger = logging.getLogger("worker")

def setup_logging():
    """Configure system-wide logging: JSON format in production, human-readable in development."""
    # Remove existing handlers to prevent duplicate logs
    root = logging.getLogger()
    if root.handlers:
        for handler in root.handlers:
            root.removeHandler(handler)
            
    handler = logging.StreamHandler(sys.stdout)
    
    # Check if we are running in production
    env = os.getenv("PYTHON_ENV")
    if env == "prod":
        formatter = JsonFormatter()
    else:
        formatter = logging.Formatter(
            fmt="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )
        
    handler.setFormatter(formatter)
    root.addHandler(handler)
    root.setLevel(logging.INFO)
