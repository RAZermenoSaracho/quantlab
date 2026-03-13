import { Routes, Route } from "react-router-dom";
import { nav } from "./routes/navigation";
import ProtectedRoute from "./routes/ProtectedRoute";
import Layout from "./components/layout/Layout";
import PublicLayout from "./components/layout/PublicLayout";
import { useAuth } from "./context/AuthProvider";

function App() {
  const { isAuthenticated } = useAuth();
  const publicRoutes = nav.filter((route) => !route.isPrivate);
  const privateRoutes = nav.filter((route) => route.isPrivate);

  return (
    <Routes>
      <Route element={isAuthenticated ? <Layout /> : <PublicLayout />}>
        {publicRoutes.map((route, i) => (
          <Route
            key={`public-${i}`}
            path={route.path}
            element={route.element}
          />
        ))}
      </Route>

      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        {privateRoutes.map((route, i) => (
          <Route
            key={`private-${i}`}
            path={route.path}
            element={route.element}
          />
        ))}
      </Route>
    </Routes>
  );
}

export default App;
