from slowapi import Limiter
from slowapi.util import get_remote_address

# This application currently runs as a single FastAPI process. Keep rate-limit
# counters in-process so requests never depend on an external data store.
limiter = Limiter(key_func=get_remote_address)
