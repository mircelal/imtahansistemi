import { api } from "./client";

export type Course = {
  id: number;
  name: string;
  description: string | null;
  manager_id: number;
  has_logo?: boolean;
  created_at: string;
  is_active: boolean;
};

export async function listCourses() {
  const { data } = await api.get<Course[]>("/api/courses/");
  return data;
}

export async function createCourse(payload: { name: string; description?: string; manager_id: number; is_active: boolean }) {
  const { data } = await api.post<Course>("/api/courses/", payload);
  return data;
}

export async function deleteCourse(courseId: number) {
  await api.delete(`/api/courses/${courseId}`);
}

export async function uploadCourseLogo(courseId: number, file: File) {
  const form = new FormData();
  form.append("file", file);
  await api.post(`/api/courses/${courseId}/logo`, form);
}

export async function deleteCourseLogo(courseId: number) {
  await api.delete(`/api/courses/${courseId}/logo`);
}

export type Student = {
  id: number;
  course_id: number;
  student_number: string;
  full_name: string;
  created_at: string;
};

export async function listStudents(courseId: number) {
  const { data } = await api.get<Student[]>(`/api/courses/${courseId}/students`);
  return data;
}

export async function createStudent(courseId: number, payload: { student_number: string; full_name: string }) {
  const { data } = await api.post<Student>(`/api/courses/${courseId}/students`, payload);
  return data;
}

export async function uploadStudentsBulk(courseId: number, file: File) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<{ inserted: number }>(`/api/courses/${courseId}/students/bulk`, form);
  return data;
}

export type CourseOperatorMember = {
  user_id: number;
  email: string;
  full_name: string;
};

export async function listCourseOperators(courseId: number) {
  const { data } = await api.get<CourseOperatorMember[]>(`/api/courses/${courseId}/operators`);
  return data;
}

export async function attachCourseOperator(courseId: number, operator_user_id: number) {
  const { data } = await api.post<CourseOperatorMember>(`/api/courses/${courseId}/operators`, {
    operator_user_id
  });
  return data;
}

export async function inviteCourseOperator(
  courseId: number,
  payload: { email: string; full_name: string; password: string }
) {
  const { data } = await api.post<CourseOperatorMember>(`/api/courses/${courseId}/operators/invite`, payload);
  return data;
}

export async function detachCourseOperator(courseId: number, operatorUserId: number) {
  await api.delete(`/api/courses/${courseId}/operators/${operatorUserId}`);
}
