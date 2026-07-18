import { Navigate, useParams } from "react-router-dom";

export default function StudentsTab() {
  const { courseId } = useParams();
  const cid = Number(courseId);
  if (!Number.isFinite(cid) || cid <= 0) {
    return <Navigate to="/students" replace />;
  }
  return <Navigate to={`/students?course=${cid}`} replace />;
}
