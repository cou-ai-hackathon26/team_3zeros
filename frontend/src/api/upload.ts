import { ApiError, readCsrfCookie } from "./client";

/** Upload one multipart form with byte progress (fetch cannot report it). Used for large reference books (D-29). */
export function uploadWithProgress<T>(path: string, form: FormData, onProgress: (fraction: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/v1${path}`);
    xhr.withCredentials = true;
    const csrf = readCsrfCookie();
    if (csrf) xhr.setRequestHeader("X-CSRFToken", csrf);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onerror = () => reject(new ApiError({ status: 0, code: "network_error", message: "The upload could not reach the server." }));
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(body as T);
      const err = (body as { error?: { code?: string; message?: string } } | null)?.error;
      reject(new ApiError({ status: xhr.status, code: err?.code ?? "upload_failed", message: err?.message ?? "The upload failed.", rawBody: body }));
    };
    xhr.send(form);
  });
}
