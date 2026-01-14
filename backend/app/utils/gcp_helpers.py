from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials
from googleapiclient.errors import HttpError

from logger import global_logger
from configs import creds




def build_service(creds: Credentials, service_name: str, version: str):
    try:
        service = build(service_name, version, credentials=creds)
        global_logger.debug(f"Google {service_name} service built successfully.")
        return service
    except HttpError as error:
        global_logger.error(f"An error occurred while building {service_name} service: {error}")
        return None


google_drive_service = build_service(creds, 'drive', 'v3')
google_sheets_service = build_service(creds, 'sheets', 'v4')


def list_files_by_folder_name(creds: Credentials, folder_name: str) -> list:
    try:
        folder_query = f"name = '{folder_name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
        folder_results = google_drive_service.files().list(q=folder_query, fields="files(id, name)").execute()
        folders = folder_results.get('files', [])
        if not folders:
            raise ValueError(f"No folder found with name: {folder_name}")
        folder_id = folders[0]['id']
        global_logger.debug(f"Folder '{folder_name}' found with ID: {folder_id}")
        content_query = f"'{folder_id}' in parents and trashed = false"
        results = google_drive_service.files().list(q=content_query, fields="nextPageToken, files(id, name, mimeType)", pageSize=50).execute()
        items = results.get('files', [])
        return items
    except ValueError as error:
        global_logger.error(error)
        return []


def get_spreadsheet_id_by_name(drive_service, file_name: str) -> str:
    """Search for a spreadsheet by name and return its ID."""
    query = (f"name = '{file_name}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false")
    result = drive_service.files().list(q=query, fields="files(id, name)").execute()
    files = result.get('files', [])
    
    if not files:
        global_logger.warning(f"No spreadsheet found with name: {file_name}")
        return None
    
    return files[0]['id']


def get_sheet_data(sheets_service, spreadsheet_id: str, range_name: str) -> list:
    """Retrieve raw data from a specific spreadsheet range."""
    result = sheets_service.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id, 
        range=range_name
    ).execute()
    return result.get('values', [])


def filter_empty_rows(values: list) -> list:
    """Filter out rows that are empty or only contain data in the first column."""
    if not values:
        return []

    return [
        row for row in values 
        if len(row) > 1 and any(str(cell).strip() for cell in row[1:])
    ]


def get_filtered_data_by_names(file_name: str, sheet_name: str, creds: Credentials | None = None) -> list:
    """Orchestrator function to find file, get data, and filter it."""
    try:
        if creds is not None:
            google_drive_service = build_service(creds, 'drive', 'v3')
            google_sheets_service = build_service(creds, 'sheets', 'v4')
        spreadsheet_id = get_spreadsheet_id_by_name(google_drive_service, file_name)
        if not spreadsheet_id:
            return []

        range_name = f"'{sheet_name}'!A:E"
        raw_values = get_sheet_data(google_sheets_service, spreadsheet_id, range_name)
        filtered_data = filter_empty_rows(raw_values)
        
        global_logger.info(f"Successfully processed '{file_name}' > '{sheet_name}'")
        return filtered_data

    except HttpError as error:
        global_logger.error(f"Google API error: {error}")
        return []
    except Exception as e:
        global_logger.error(f"Unexpected error: {e}")
        return []