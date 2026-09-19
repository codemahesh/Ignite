"""Cognee client initialization with cloud API credentials.

This module ensures cognee is properly configured with authentication headers
for the Cognee Cloud API before any cognee operations are performed.
"""

import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_initialized = False


def init_cognee() -> None:
    """Initialize cognee with cloud API credentials from environment variables.
    
    Required environment variables:
    - COGNEE_API_KEY: Your Cognee API key
    - COGNEE_API_BASE_URL: The base URL for your Cognee tenant
    - COGNEE_TENANT_ID: Your tenant ID
    - COGNEE_USER_ID: Your user ID
    """
    global _initialized
    
    if _initialized:
        return
    
    import cognee
    from pathlib import Path
    
    # Get credentials from environment
    api_key = os.getenv("COGNEE_API_KEY")
    api_base_url = os.getenv("COGNEE_API_BASE_URL")
    tenant_id = os.getenv("COGNEE_TENANT_ID")
    user_id = os.getenv("COGNEE_USER_ID")
    
    if not all([api_key, api_base_url, tenant_id, user_id]):
        missing = []
        if not api_key: missing.append("COGNEE_API_KEY")
        if not api_base_url: missing.append("COGNEE_API_BASE_URL")
        if not tenant_id: missing.append("COGNEE_TENANT_ID")
        if not user_id: missing.append("COGNEE_USER_ID")
        
        raise ValueError(
            f"Missing required Cognee cloud credentials: {', '.join(missing)}. "
            "Please check your .env file."
        )
    
    try:
        # Ensure the environment variables are set for cognee to pick up
        os.environ["COGNEE_API_KEY"] = api_key
        os.environ["COGNEE_API_BASE_URL"] = api_base_url
        os.environ["COGNEE_TENANT_ID"] = tenant_id
        os.environ["COGNEE_USER_ID"] = user_id
        
        # Configure cognee client for cloud API
        # The API client should automatically pick up these env vars
        if hasattr(cognee, 'config'):
            if hasattr(cognee.config, 'api_key'):
                cognee.config.api_key = api_key
            if hasattr(cognee.config, 'api_base_url'):
                cognee.config.api_base_url = api_base_url
        
        # Set data storage directory for local caching
        backend_dir = Path(__file__).resolve().parent.parent
        data_dir = backend_dir / ".data_storage"
        data_dir.mkdir(parents=True, exist_ok=True)
        
        if hasattr(cognee, 'config') and hasattr(cognee.config, 'data_root_directory'):
            cognee.config.data_root_directory(str(data_dir))
        
        _initialized = True
        logger.info("Cognee cloud client initialized successfully")
        logger.info(f"  API URL: {api_base_url}")
        logger.info(f"  Tenant ID: {tenant_id}")
        
    except Exception as e:
        logger.error(f"Failed to initialize Cognee client: {e}", exc_info=True)
        raise


def get_cognee():
    """Get an initialized cognee instance.
    
    This ensures cognee is properly configured before use.
    """
    if not _initialized:
        init_cognee()
    
    import cognee
    return cognee
