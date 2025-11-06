import express from "express";
import cors from "cors";
import userRoutes from "./routes/userRoutes.js";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/users", userRoutes);

// Health check route
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "OK", 
    message: "TillFlow Backend is running",
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ 
    success: false,
    message: "Route not found" 
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Error:", error);
  res.status(500).json({ 
    success: false,
    message: "Internal server error" 
  });
});

export default app;