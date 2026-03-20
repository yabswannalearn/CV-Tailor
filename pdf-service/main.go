package main

import (
	"net/http"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type LaTeXRequest struct {
	Latex string `json:"latex" binding:"required"`
}

func main() {
	r := gin.Default()

	r.POST("/generate", func(c *gin.Context) {
		var req LaTeXRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// 1. Create a unique temporary directory
		jobID := uuid.New().String()
		tmpDir := filepath.Join(os.TempDir(), jobID)
		os.MkdirAll(tmpDir, 0755)
		defer os.RemoveAll(tmpDir) // Clean up after request

		texFile := filepath.Join(tmpDir, "resume.tex")
		pdfFile := filepath.Join(tmpDir, "resume.pdf")

		// 2. Write LaTeX string to file
		if err := os.WriteFile(texFile, []byte(req.Latex), 0644); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to write .tex file"})
			return
		}

		// 3. Execute pdflatex
		// -interaction=nonstopmode ensures it doesn't hang on errors
		cmd := exec.Command("pdflatex", "-interaction=nonstopmode", "-output-directory", tmpDir, texFile)
		out, err := cmd.CombinedOutput()
		if err != nil {
			fmt.Printf("LaTeX Error Output: %s\n", string(out)) // This shows up in your VS Code Terminal
			c.JSON(http.StatusInternalServerError, gin.H{"error": "LaTeX compilation failed", "details": string(out)})
			return
		}
		// 4. Return the PDF file
		c.FileAttachment(pdfFile, "tailored_resume.pdf")
	})

	r.Run(":8081") // Running on a different port than FastAPI
}