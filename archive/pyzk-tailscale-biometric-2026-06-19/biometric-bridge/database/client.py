from __future__ import annotations

import os
from functools import lru_cache

from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

@lru_cache(maxsize=1)
def get_crm_client() -> Client:
    # Uses the service-role key, not the anon key. The CRM's RLS policies require
    # auth.uid() IS NOT NULL (a logged-in app user) — the bridge has no such session,
    # so anon-key reads here would silently return empty results under RLS. This is
    # a backend-only, network-isolated process (gated by BRIDGE_API_KEY/CORS), so a
    # privileged key is an acceptable trade-off for it specifically.
    url = os.getenv("CRM_SUPABASE_URL", "")
    key = os.getenv("CRM_SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        raise RuntimeError(
            "CRM_SUPABASE_URL and CRM_SUPABASE_SERVICE_KEY must be set in .env"
        )
    return create_client(url, key)
