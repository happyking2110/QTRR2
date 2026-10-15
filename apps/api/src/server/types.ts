export type Role = 'admin' | 'ban4' | 'unit' | 'viewer';

export interface Actor {
  userId: string;
  role: Role;
  unitId: string | null;
}
