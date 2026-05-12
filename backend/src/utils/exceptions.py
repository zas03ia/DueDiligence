from fastapi import HTTPException, status


class DueDiligenceException(Exception):
    """Base exception for the application"""
    pass


class NotFoundError(DueDiligenceException):
    """Raised when a resource is not found"""
    def __init__(self, resource: str, identifier: str):
        self.resource = resource
        self.identifier = identifier
        super().__init__(f"{resource} with identifier '{identifier}' not found")


class ValidationError(DueDiligenceException):
    """Raised when validation fails"""
    pass


class IndexingError(DueDiligenceException):
    """Raised when document indexing fails"""
    pass


class GenerationError(DueDiligenceException):
    """Raised when answer generation fails"""
    pass


class DatabaseError(DueDiligenceException):
    """Raised when database operation fails"""
    pass


# HTTP Exception helpers
def create_not_found_exception(resource: str, identifier: str) -> HTTPException:
    """Create a 404 HTTP exception"""
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"{resource} with identifier '{identifier}' not found"
    )


def create_validation_exception(message: str) -> HTTPException:
    """Create a 422 HTTP exception"""
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=message
    )


def create_internal_exception(message: str) -> HTTPException:
    """Create a 500 HTTP exception"""
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=message
    )
