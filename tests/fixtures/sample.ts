interface User {
  id: number;
  name: string;
  email: string;
}

export function validateUser(user: unknown): user is User {
  if (typeof user !== 'object' || user === null) {
    return false;
  }
  const obj = user as Record<string, unknown>;
  return (
    typeof obj.id === 'number' &&
    typeof obj.name === 'string' &&
    typeof obj.email === 'string'
  );
}

export async function fetchUser(id: number): Promise<User> {
  const response = await fetch(`/api/users/${id}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch user ${id}`);
  }
  return response.json();
}
