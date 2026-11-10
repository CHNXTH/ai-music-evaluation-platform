import Dexie, { type Table } from 'dexie';
import type { Workspace } from './model';
import { initialWorkspace, now, uid } from './model';
export interface WorkspaceRepository {
  read(): Promise<Workspace>;
  mutate(
    actor: string,
    action: string,
    entity: string,
    fn: (w: Workspace) => void,
  ): Promise<Workspace>;
}
export class LocalRepository extends Dexie implements WorkspaceRepository {
  workspaces!: Table<Workspace & { id: string }, string>;
  constructor(name = 'ai-music-evaluation-v1') {
    super(name);
    this.version(1).stores({ workspaces: 'id' });
  }
  async read() {
    return this.transaction('rw', this.workspaces, async () => {
      const current = await this.workspaces.get('local');
      if (current) return current;
      const w = initialWorkspace();
      await this.workspaces.put({ ...w, id: 'local' });
      return w;
    });
  }
  async mutate(actor: string, action: string, entity: string, fn: (w: Workspace) => void) {
    return this.transaction('rw', this.workspaces, async () => {
      const w = (await this.workspaces.get('local')) ?? initialWorkspace();
      fn(w);
      w.revision++;
      w.audit.push({ id: uid(), actor, action, entity, at: now() });
      await this.workspaces.put({ ...w, id: 'local' });
      return w;
    });
  }
}
export const repository = new LocalRepository();
// Future remote adapters implement this policy alongside server-side authorization.
export interface AuthorizationProvider {
  can(actorId: string, operation: 'annotate' | 'adjudicate' | 'publish'): Promise<boolean>;
}
