import {
  ref,
  uploadBytes,
  getDownloadURL,
  listAll,
  deleteObject,
} from 'firebase/storage';
import { storage } from './firebaseConfig';

export async function uploadFile(userId: string, projectId: string, fileName: string, file: Blob): Promise<{ name: string; url: string }> {
  const fileRef = ref(storage, `users/${userId}/projects/${projectId}/${fileName}`);
  await uploadBytes(fileRef, file);
  const url = await getDownloadURL(fileRef);
  return { name: fileName, url };
}

export async function listProjectFiles(userId: string, projectId: string): Promise<Array<{ name: string; url: string }>> {
  const projectRef = ref(storage, `users/${userId}/projects/${projectId}`);
  const result = await listAll(projectRef);
  const files = await Promise.all(
    result.items.map(async (item) => {
      const url = await getDownloadURL(item);
      return { name: item.name, url };
    })
  );
  return files;
}

export async function deleteFile(userId: string, projectId: string, fileName: string): Promise<void> {
  const fileRef = ref(storage, `users/${userId}/projects/${projectId}/${fileName}`);
  await deleteObject(fileRef);
}
