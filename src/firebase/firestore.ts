import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';

export interface WorkspaceFirestoreState {
  files: Record<string, string>;
  activeFile: string;
  openFiles: string[];
  sidebarVisible: boolean;
  aiPanelVisible: boolean;
  previewDevice: string;
  isRunning: boolean;
  editorOptions: {
    fontSize: number;
    wordWrap: boolean;
    tabSize: number;
    minimap: boolean;
    lineNumbers: boolean;
    theme: string;
  };
  currentProject: any;
  projects: any[];
  chatHistory: Array<{ role: string; content: string; timestamp: number }>;
  isAiTyping: boolean;
}

export async function loadWorkspaceState(userId: string): Promise<WorkspaceFirestoreState | null> {
  const workspaceDoc = doc(db, 'users', userId);
  const snapshot = await getDoc(workspaceDoc);

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();
  return (data.workspace || null) as WorkspaceFirestoreState;
}

export async function saveWorkspaceState(userId: string, workspaceState: WorkspaceFirestoreState) {
  const workspaceDoc = doc(db, 'users', userId);
  await setDoc(workspaceDoc, { workspace: workspaceState }, { merge: true });
}
