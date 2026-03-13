import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import type { AuthUser } from "@quantlab/contracts";

type AuthContextType = {
    user: AuthUser | null;
    token: string | null;
    isAuthenticated: boolean;
    login: (token: string, user: AuthUser) => void;
    updateUser: (user: AuthUser) => void;
    logout: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {

    const [token, setToken] = useState<string | null>(
        localStorage.getItem("token")
    );

    const [user, setUser] = useState<AuthUser | null>(() => {
        const stored = localStorage.getItem("user");
        return stored ? JSON.parse(stored) : null;
    });

    const isAuthenticated = !!token;

    const login = (newToken: string, newUser: AuthUser) => {
        localStorage.setItem("token", newToken);
        localStorage.setItem("user", JSON.stringify(newUser));

        setToken(newToken);
        setUser(newUser);
    };

    const logout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");

        setToken(null);
        setUser(null);
    };

    const updateUser = (nextUser: AuthUser) => {
        localStorage.setItem("user", JSON.stringify(nextUser));
        setUser(nextUser);
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                token,
                isAuthenticated,
                login,
                updateUser,
                logout,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used inside AuthProvider");
    }
    return context;
}
