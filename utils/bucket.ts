import { s3, S3Client, S3File } from "bun";

export const S3 = new S3Client({
    accessKeyId: process.env.BUCKET_ACCESS_KEY,
    secretAccessKey: process.env.BUCKET_SECRET_KEY,
    bucket: process.env.BUCKET_NAME,
    endpoint: process.env.BUCKET_ENDPOINT,
})

async function uploadToBucket(filename: string, file: File) {
    const s3file: S3File = S3.file(filename)
    await s3file.write(file);
    return `${process.env.BUCKET_PUBLIC_URL}/${filename}`;
}

export async function uploadCategoryAssets(categoryId: string, files: File[]) {
    const uploadPromises = files.map(file => {
        const filename = `categories/${categoryId}/${file.name}`;
        return uploadToBucket(filename, file);
    });
    await Promise.all(uploadPromises);
}

export async function deleteAssetFromBucket(categoryId: string, filename: string) {
    const s3file: S3File = S3.file(`categories/${categoryId}/${filename}`);
    await s3file.delete();
}

export async function uploadProfilePicture(userId: string, file: File) {
    const filename = `users/${userId}/profile_picture_${Date.now()}.${file.name.split('.').pop()}`;
    const url = await uploadToBucket(filename, file);
    return url;
}

export async function deleteProfilePicture(userId: string, filename: string) {
    const s3file: S3File = S3.file(`users/${userId}/${filename}`);
    await s3file.delete();
    return;
}

