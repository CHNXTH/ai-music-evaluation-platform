import { createContext, useContext } from 'react';
import type { Workspace, Rubric, Reviewer } from './model';
export type AppContextValue = {
  w: Workspace;
  rubric: Rubric;
  actor: Reviewer | undefined;
  actorId: string;
  setActorId: (id: string) => void;
  rubricVersion: string;
  setRubricVersion: (v: string) => void;
  mutate: (action: string, entity: string, fn: (w: Workspace) => void) => Promise<boolean>;
  notify: (message: string, error?: boolean) => void;
  busy: boolean;
  setHasUnsavedChanges: (dirty: boolean) => void;
  navigate: (page: string) => void;
};
export const AppContext = createContext<AppContextValue>(null!);
export const useApp = () => useContext(AppContext);
