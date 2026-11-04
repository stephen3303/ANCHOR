export interface AppUser {
  id: string;
  login: string;
  name: string;
  commandId: string;
  commandName: string;
  rank: string;
  community: string;
  billet: string;
  unit: string;
  command: string;
  location: string;
  email: string;
  dsn: string;
  roles: { name: string; detail: string; granted: boolean }[];
  groups: string[];
}
export interface UserChoice {
  id: string;
  login: string;
  name: string;
  commandName: string;
}
