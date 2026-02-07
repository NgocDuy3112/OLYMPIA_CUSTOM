export interface User {
  id: string;
  code: string;
  name: string;
  email?: string;
  status?: 'active' | 'inactive';
}

export interface Question {
  id: string;
  content: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  category?: string;
}

export interface Match {
  id: string;
  code: string;
  name: string;
  users: User[];
  questions: Question[];
  createdAt?: string;
}
