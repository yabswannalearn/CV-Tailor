package main

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type LaTeXRequest struct {
	Latex string `json:"latex" binding:"required"`
}

func main() {
	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins: []string{"http://localhost:3000"},
		AllowMethods: []string{"POST", "OPTIONS"},
		AllowHeaders: []string{"Content-Type"},
	}))

	r.POST("/generate", func(c *gin.Context) {
		var req LaTeXRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		jobID := uuid.New().String()
		tmpDir := filepath.Join(os.TempDir(), jobID)
		os.MkdirAll(tmpDir, 0755)
		defer os.RemoveAll(tmpDir)

		texFile := filepath.Join(tmpDir, "resume.tex")
		pdfFile := filepath.Join(tmpDir, "resume.pdf")

		if err := os.WriteFile(texFile, []byte(req.Latex), 0644); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to write .tex file"})
			return
		}

		for i := 0; i < 2; i++ {
			cmd := exec.Command(
				"pdflatex",
				"-interaction=nonstopmode",
				"-output-directory", tmpDir,
				texFile,
			)
			out, err := cmd.CombinedOutput()
			if err != nil {
				fmt.Printf("LaTeX Error Output:\n%s\n", string(out))
				c.JSON(http.StatusInternalServerError, gin.H{
					"error":   "LaTeX compilation failed",
					"details": string(out),
				})
				return
			}
		}

		pdfBytes, err := os.ReadFile(pdfFile)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read PDF"})
			return
		}

		c.Header("Content-Disposition", "inline; filename=tailored_resume.pdf")
		c.Data(http.StatusOK, "application/pdf", pdfBytes)
	})

	r.Run(":8081")
}