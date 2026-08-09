import { supabase } from "@/integrations/supabase/client";

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

/** Load the signed-in student's saved profile from the database. */
export async function fetchRemoteProfile(userId: string): Promise<StudentProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    userId: data.id,
    studentName: data.student_name,
    className: data.class_name,
    country: data.country,
    educationBoard: data.education_board,
    examPrepTime: data.exam_prep_time,
    parentEmail: data.parent_email ?? "",
    dailyTaskGoal: data.daily_task_goal,
  };
}

/** Persist the profile to the database so it is kept forever. */
export async function saveRemoteProfile(profile: StudentProfile) {
  const { error } = await supabase.from("profiles").upsert({
    id: profile.userId,
    student_name: profile.studentName,
    class_name: profile.className,
    country: profile.country,
    education_board: profile.educationBoard,
    exam_prep_time: profile.examPrepTime,
    parent_email: profile.parentEmail || null,
    daily_task_goal: profile.dailyTaskGoal,
  });
  if (error) throw error;
}
