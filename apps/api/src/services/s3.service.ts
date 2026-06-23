import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { config } from '../config';

class S3Service {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    this.bucket = config.aws.s3Bucket;
    this.client = new S3Client({
      region: config.aws.region,
      endpoint: config.aws.endpointUrl,
      forcePathStyle: !!config.aws.endpointUrl,
      credentials: {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
      },
    });
  }

  /**
   * Generates a S3 presigned POST policy and fields for direct client multipart uploads.
   */
  public async generatePresignedPost(
    s3Key: string,
    mimeType: string,
    expiresInSeconds: number = config.limits.presignedPostExpiresSeconds
  ) {
    return createPresignedPost(this.client, {
      Bucket: this.bucket,
      Key: s3Key,
      Conditions: [
        ['content-length-range', config.limits.fileSizeMinBytes, config.limits.fileSizeMaxBytes],
        ['eq', '$Content-Type', mimeType],
      ],
      Fields: {
        'Content-Type': mimeType,
      },
      Expires: expiresInSeconds,
    });
  }

  public getBucketName(): string {
    return this.bucket;
  }
}

export const s3Service = new S3Service();
