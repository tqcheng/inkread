export interface Book {
  id: number;
  title: string;
  filename: string;
  file_path: string;
  file_size: number | null;
  category: string | null;
  category_confidence: number | null;
  tags: string[] | null;
  tags_source: string | null;
  encoding_original: string | null;
  is_utf8_converted: boolean;
  created_at: string;
  updated_at: string;
  is_favorite: boolean;
  is_deleted: boolean;
  last_read_position: number;
  last_read_chapter: string | null;
  ai_analyzed_at: string | null;
  chapters?: Chapter[];
}

export interface BookListResponse {
  items: Book[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface Chapter {
  id: number;
  book_id: number;
  title: string | null;
  position_start: number;
  position_end: number | null;
  chapter_index: number | null;
}

export interface BookDetail extends Book {
  chapters: Chapter[];
}

export interface ApiError {
  error: string;
  message: string;
  details: Record<string, any> | null;
}

export interface GetBooksParams {
  category?: string;
  search?: string;
  sort?: string;
  order?: string;
  page?: number;
  page_size?: number;
  confidence_min?: number;
  is_favorite?: boolean;
}

export interface UpdateMetadataData {
  category?: string;
  tags?: string[];
  tags_source?: string;
}

export interface BookContentResponse {
  book_id: number;
  content: string;
  next_offset: number | null;
  is_end: boolean;
}

export interface BatchDeleteRequest {
  ids: number[];
  permanent?: boolean;
}

export interface ScanRequest {
  path?: string;
  force_rescan?: boolean;
}

export interface ScanResponse {
  task_id: string;
  status: string;
  message: string;
}

export interface ScanStatusResponse {
  task_id: string;
  status: string;
  progress: { current: number; total: number };
  result: { scanned?: number; new_books?: number; errors?: number } | null;
  error: string | null;
  created_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface ScanResultSummary {
  total_tasks: number;
  running: number;
  completed: number;
  failed: number;
}

export interface ReadingProgressUpdate {
  current_position: number;
  current_chapter?: string;
  reading_settings?: Record<string, any>;
}

// Auth types
export interface AuthStatus {
  enabled: boolean;
  has_password: boolean;
}

export interface AuthLoginRequest {
  password: string;
}

export interface AuthLoginResponse {
  token: string;
}

export interface SecuritySettingsRequest {
  enabled: boolean;
  current_password?: string;
  new_password?: string;
}

export interface SecuritySettingsResponse {
  success: boolean;
  enabled: boolean;
}
