import { Routes, Route } from "react-router-dom";
import { nav } from "./routes/navigation";
import ProtectedRoute from "./routes/ProtectedRoute";
import Layout from "./components/layout/Layout";

function App() {
  const publicRoutes = nav.filter((route) => !route.isPrivate);
  const privateRoutes = nav.filter((route) => route.isPrivate);

  return (
    <Routes>
      {publicRoutes.map((route, i) => (
        <Route key={`public-${i}`} path={route.path} element={route.element} />
      ))}

      <Route element={<Layout />}>
        {privateRoutes.map((route, i) => (
          <Route
            key={`private-${i}`}
            path={route.path}
            element={<ProtectedRoute>{route.element}</ProtectedRoute>}
          />
        ))}
      </Route>
    </Routes>
  );
}

export default App;
