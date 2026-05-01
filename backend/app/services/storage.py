from io import BytesIO

from minio import Minio

from app.config import get_settings

settings = get_settings()


class StorageService:
    def __init__(self) -> None:
        self.client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_root_user,
            secret_key=settings.minio_root_password,
            secure=settings.minio_secure,
        )

    def ensure_bucket(self, bucket: str) -> None:
        if not self.client.bucket_exists(bucket):
            self.client.make_bucket(bucket)

    def upload_bytes(self, bucket: str, object_name: str, data: bytes, content_type: str) -> str:
        self.ensure_bucket(bucket)
        self.client.put_object(
            bucket_name=bucket,
            object_name=object_name,
            data=BytesIO(data),
            length=len(data),
            content_type=content_type,
        )
        return object_name

    def get_bytes(self, bucket: str, object_name: str) -> bytes:
        response = self.client.get_object(bucket, object_name)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()

    def list_object_names(self, bucket: str, prefix: str) -> list[str]:
        return [
            obj.object_name
            for obj in self.client.list_objects(bucket_name=bucket, prefix=prefix, recursive=True)
        ]
