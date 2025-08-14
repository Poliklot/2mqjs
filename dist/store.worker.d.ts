export type PersistBackend = 'auto' | 'indexedDB' | 'localStorage';
export interface NormalizedPersist {
    backend: PersistBackend;
    namespace?: string;
    version?: number;
    debounceMs: number;
    keys?: string[];
}
