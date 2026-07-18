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

export async function getCourse(courseId: number) {
  const { data } = await api.get<Course>(`/api/courses/${courseId}`);
  return data;
}

export type CourseDashboardStats = {
  students_count: number;
  operators_count: number;
  exams_own_count: number;
  tickets_active_count: number;
  orders_pending_count: number;
  orders_confirmed_today: number;
  wallet_balance: number;
  wallet_currency: string;
  revenue_total: number;
  revenue_today: number;
  tickets_sold_total: number;
};

export type CourseDashboardExamBrief = {
  id: number;
  title: string;
  scheduled_at: string | null;
  venue: string | null;
  city: string | null;
  delivery_mode: string;
  question_count: number;
  is_active: boolean;
  list_price_amount: number;
  list_price_currency: string;
};

export type CourseDashboardPlatformExam = {
  id: number;
  title: string;
  scheduled_at: string | null;
  venue: string | null;
  city: string | null;
  delivery_mode: string;
  seat_quota: number | null;
  seat_remaining: number | null;
  has_course_ticket: boolean;
  course_ticket_id: number | null;
  list_price_amount: number;
  list_price_currency: string;
};

export type CourseDashboardTicketBrief = {
  id: number;
  title: string;
  exam_id: number | null;
  exam_title: string | null;
  exam_scope: string | null;
  price_amount: number;
  currency: string;
  quota: number | null;
  confirmed_count: number;
  remaining_quota: number | null;
  sale_status: string;
  is_active: boolean;
};

export type CourseDashboard = {
  course_id: number;
  course_name: string;
  course_description: string | null;
  has_logo: boolean;
  manager_id: number;
  manager_name: string | null;
  is_active: boolean;
  stats: CourseDashboardStats;
  exams_own: CourseDashboardExamBrief[];
  exams_platform_open: CourseDashboardPlatformExam[];
  tickets: CourseDashboardTicketBrief[];
};

export async function getCourseDashboard(courseId: number) {
  const { data } = await api.get<CourseDashboard>(`/api/courses/${courseId}/dashboard`);
  return data;
}

export async function listPlatformExams(courseId: number) {
  const { data } = await api.get<CourseDashboardPlatformExam[]>(`/api/courses/${courseId}/platform-exams`);
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
  login_user_id?: number | null;
  login_email?: string | null;
};

export type StudentsSummary = {
  total: number;
  with_cabinet: number;
  without_cabinet: number;
  with_results: number;
  avg_exams_per_student: number | null;
};

const STUDENTS_PAGE_MAX = 200;

export async function getCourseStudentsSummary(courseId: number) {
  const { data } = await api.get<StudentsSummary>(`/api/courses/${courseId}/students/summary`);
  return data;
}

/** Kurs şagirdlərini səhifələyərək gətirir (server limiti: 200/sorğu). */
export async function listStudents(courseId: number) {
  const items: Student[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total) {
    const { data } = await api.get<{ items: Student[]; total: number }>(
      `/api/courses/${courseId}/students?limit=${STUDENTS_PAGE_MAX}&offset=${offset}`,
    );
    items.push(...data.items);
    total = data.total;
    offset += STUDENTS_PAGE_MAX;
    if (data.items.length === 0) break;
  }

  return items;
}

export async function createStudent(courseId: number, payload: { student_number: string; full_name: string }) {
  const { data } = await api.post<Student>(`/api/courses/${courseId}/students`, payload);
  return data;
}

export async function createStudentLogin(
  courseId: number,
  studentId: number,
  payload: { email: string; password: string; full_name?: string }
) {
  const { data } = await api.post<{ id: number; email: string }>(
    `/api/courses/${courseId}/students/${studentId}/login`,
    payload
  );
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
