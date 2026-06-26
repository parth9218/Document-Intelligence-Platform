class PermanentFailure(Exception):
    """Exception raised for unrecoverable errors in document processing."""
    def __init__(self, error_code: str, message: str):
        self.error_code = error_code
        self.message = message
        super().__init__(message)

class TransientFailure(Exception):
    """Exception raised for temporary failures where processing should be retried."""
    pass
