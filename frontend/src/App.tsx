import { Routes, Route } from "react-router-dom";
import { nav } from "./routes/navigation";
import ProtectedRoute from "./routes/ProtectedRoute";
import Layout from "./components/layout/Layout";

function App() {
  return (
      <Routes>
        <Route element={<Layout />}>
          {nav.map((route, i) => {
            if (route.isPrivate) {
              return (
                <Route
                  key={i}
                  path={route.path}
                  element={<ProtectedRoute>{route.element}</ProtectedRoute>}
                />
              );
            }

            return (
              <Route
                key={i}
                path={route.path}
                element={route.element}
              />
            );
          })}
        </Route>
      </Routes>
  );
}

export default App;
