from google.oauth2.credentials import Credentials
from googleapiclient.errors import HttpError
from googleapiclient.discovery import build

from configs import GCPSettings
from logger import global_logger

gcp_settings = GCPSettings()


def build_service(creds: Credentials, service_name: str, version: str):
    try:
        service = build(service_name, version, credentials=creds)
        global_logger.debug(f"Google {service_name} service built successfully.")
        return service
    except HttpError as error:
        global_logger.error(f"An error occurred while building {service_name} service: {error}")
        return None

def get_google_drive_service():
    return build_service(gcp_settings.GCP_CREDS, 'drive', 'v3')

def get_google_sheets_service():
    return build_service(gcp_settings.GCP_CREDS, 'sheets', 'v4')