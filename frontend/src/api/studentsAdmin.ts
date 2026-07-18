import { api } from "./client";
import type { StudentProfile } from "./studentPortal";

export type StudentListRow = {
  id: number;
  course_id: number;
  course_name: string;
  student_number: string;
  full_name: string;
  created_at: string;
  login_user_id: number | null;
  login_email: string | null;
  has_login: boolean;
  exam_count: number;
  last_percent: number | null;
  last_graded_at: string | null;
};

export type StudentListPage = {
  items: StudentListRow[];
  total: number;
};

export type StudentsSummary = {
  total: number;
  with_cabinet: number;
  without_cabinet: number;
  with_results: number;
  avg_exams_per_student: number | null;
};

export type StudentListParams = {
  course_id?: number;
  search?: string;
  has_login?: boolean;
  sort?: string;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
};

function buildQuery(params: StudentListParams) {
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.has_login !== undefined) q.set("has_login", String(params.has_login));
  if (params.sort) q.set("sort", params.sort);
  if (params.order) q.set("order", params.order);
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.offset != null) q.set("offset", String(params.offset));
  return q.toString();
}

export async function listAdminStudents(params: StudentListParams = {}) {
  const q = new URLSearchParams();
  if (params.course_id != null) q.set("course_id", String(params.course_id));
  if (params.search) q.set("search", params.search);
  if (params.has_login !== undefined) q.set("has_login", String(params.has_login));
  if (params.sort) q.set("sort", params.sort);
  if (params.order) q.set("order", params.order);
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.offset != null) q.set("offset", String(params.offset));
  const qs = q.toString();
  const { data } = await api.get<StudentListPage>(`/api/admin/students${qs ? `?${qs}` : ""}`);
  return data;
}

export async function getAdminStudentsSummary(courseId?: number) {
  const qs = courseId != null ? `?course_id=${courseId}` : "";
  const { data } = await api.get<StudentsSummary>(`/api/admin/students/summary${qs}`);
  return data;
}

export async function getAdminStudentProfile(studentId: number) {
  const { data } = await api.get<StudentProfile>(`/api/admin/students/${studentId}/profile`);
  return data;
}

export async function impersonateStudent(userId: number) {
  const { data } = await api.post<{ access_token: string }>(`/api/admin/students/${userId}/impersonate`);
  return data;
}

export async function listCourseStudentsPaginated(courseId: number, params: Omit<StudentListParams, "course_id"> = {}) {
  const qs = buildQuery({ ...params, course_id: courseId });
  const { data } = await api.get<StudentListPage>(`/api/courses/${courseId}/students?${qs}`);
  return data;
}

export async function getCourseStudentsSummary(courseId: number) {
  const { data } = await api.get<StudentsSummary>(`/api/courses/${courseId}/students/summary`);
  return data;
}

export async function getCourseStudentProfile(courseId: number, studentId: number) {
  const { data } = await api.get<StudentProfile>(`/api/courses/${courseId}/students/${studentId}/profile`);
  return data;
}

export async function updateStudent(
  courseId: number,
  studentId: number,
  payload: { student_number?: string; full_name?: string }
) {
  const { data } = await api.patch(`/api/courses/${courseId}/students/${studentId}`, payload);
  return data;
}

export async function deleteStudent(courseId: number, studentId: number) {
  await api.delete(`/api/courses/${courseId}/students/${studentId}`);
}

export async function deleteStudentLogin(courseId: number, studentId: number) {
  await api.delete(`/api/courses/${courseId}/students/${studentId}/login`);
}

export async function resetStudentPassword(courseId: number, studentId: number, password: string) {
  await api.post(`/api/courses/${courseId}/students/${studentId}/reset-password`, { password });
}
