export interface S3UploadOptions {
  uploadUrl: string;
  uploadFields: Record<string, string>;
  file: File;
  onProgress?: (progressPct: number) => void;
}

/**
 * Uploads a file directly to S3 (or a mock S3 endpoint) using XMLHttpRequest
 * to support native progress tracking.
 * 
 * CRITICAL: In accordance with AWS S3 Presigned POST requirements, the policy fields
 * must be appended to the FormData object in the exact order they are received, and
 * the file payload MUST be appended last.
 */
export function uploadToS3({ uploadUrl, uploadFields, file, onProgress }: S3UploadOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();

    // 1. Append all presigned fields in the exact order received
    Object.entries(uploadFields).forEach(([key, value]) => {
      formData.append(key, value);
    });

    // 2. Append the file payload LAST
    formData.append('file', file);

    xhr.open('POST', uploadUrl, true);

    // Register progress event listener on xhr.upload
    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          onProgress(percentComplete);
        }
      };
    }

    xhr.onload = () => {
      // S3 returns 204 No Content for successful presigned POST uploads
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(
          new Error(`S3 upload returned status ${xhr.status}: ${xhr.statusText || 'AccessDenied/UploadFailed'}`)
        );
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error occurred during S3 upload.'));
    };

    xhr.onabort = () => {
      reject(new Error('S3 upload was aborted.'));
    };

    xhr.send(formData);
  });
}
