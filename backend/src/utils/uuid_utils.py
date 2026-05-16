from uuid import UUID
from typing import Union


def as_uuid(value: Union[str, UUID]) -> UUID:
    """Coerce route/query IDs to UUID for ORM queries."""
    if isinstance(value, UUID):
        return value
    return UUID(str(value))
