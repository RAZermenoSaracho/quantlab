import { Routes, Route } from "react-router-dom";
import { nav } from "./routes/navigation";
import ProtectedRoute from "./routes/ProtectedRoute";

function App() {
  return (
    <Routes>
      {nav.map((route, i) => {
        if (route.isPrivate) {
          return (
            <Route
              key={i}
              path={route.path}
              element={
                <ProtectedRoute>
                  {route.element}
                </ProtectedRoute>
              }
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
    </Routes>
  );
}

export default App;
