export type StudentProfile = {
  userId: string;
  studentName: string;
  className: string;
  country: string;
  educationBoard: string;
  examPrepTime: string;
  parentEmail?: string;
  dailyTaskGoal: number;
};

const KEY = "acecoach.profile.v1";

export function loadProfile(): StudentProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StudentProfile) : null;
  } catch {
    return null;
  }
}

export function saveProfile(profile: StudentProfile) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(profile));
}

export function clearProfile() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
