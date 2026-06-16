from __future__ import annotations

import os
from functools import lru_cache

from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

@lru_cache(maxsize=1)
def get_crm_client() -> Client:
    url = os.getenv("CRM_SUPABASE_URL", "")
    key = os.getenv("CRM_SUPABASE_ANON_KEY", "")
    if not url or not key:
        raise RuntimeError(
            "CRM_SUPABASE_URL and CRM_SUPABASE_ANON_KEY must be set in .env"
        )
    return create_client(url, key)
