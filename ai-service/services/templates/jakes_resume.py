JAKES_RESUME = r"""
%-------------------------
% Resume in Latex
% Author : Jake Gutierrez
%------------------------

\documentclass[letterpaper,11pt]{article}
\setlength{\footskip}{4.08003pt}

\usepackage{latexsym}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage{marvosym}
\usepackage[usenames,dvipsnames]{color}
\usepackage{verbatim}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{fancyhdr}
\usepackage[english]{babel}
\usepackage{tabularx}
\usepackage{fontawesome}
\usepackage{multicol}
\usepackage{xcolor}

% --- FONT OPTIONS ---
% \usepackage{charter}     % Serif
% \usepackage{lmodern}     % Standard LaTeX
% \usepackage{palatino}    % Elegant Serif
% \usepackage{times}       % Times New Roman
\usepackage{lmodern}       % Standard LaTeX
\renewcommand{\familydefault}{\sfdefault}
% --------------------

\setlength{\multicolsep}{-3.0pt}
\setlength{\columnsep}{-1pt}
% \input{glyphtounicode}

\pagestyle{fancy}
\fancyhf{}
\fancyfoot{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}

\addtolength{\oddsidemargin}{-0.6in}
\addtolength{\evensidemargin}{-0.5in}
\addtolength{\textwidth}{1.19in}
\addtolength{\topmargin}{-.7in}
\addtolength{\textheight}{1.4in}

\urlstyle{same}
\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}

\titleformat{\section}{
  \vspace{-4pt}\scshape\raggedright\large\bfseries
}{}{0em}{}[\color{black}\titlerule \vspace{-5pt}]

% \pdfgentounicode=1

\newcommand{\resumeItem}[1]{
  \item\small{{#1 \vspace{-2pt}}}
}

\newcommand{\resumeSubheading}[4]{
  \vspace{-2pt}\item
    \begin{tabular*}{1.0\textwidth}[t]{l@{\extracolsep{\fill}}r}
      \textbf{#1} & \textbf{\small #2} \\
      \textit{\small#3} & \textit{\small #4} \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeProjectHeading}[2]{
    \item
    \begin{tabular*}{1.001\textwidth}{l@{\extracolsep{\fill}}r}
      \small#1 & \textbf{\small #2}\\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeSubItem}[1]{\resumeItem{#1}\vspace{-4pt}}
\renewcommand\labelitemi{$\vcenter{\hbox{\tiny$\bullet$}}$}
\renewcommand\labelitemii{$\vcenter{\hbox{\tiny$\bullet$}}$}
\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.0in, label={}]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}
\newcommand{\resumeItemListStart}{\begin{itemize}}
\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-5pt}}

\begin{document}

%----------HEADING----------
<<HEADING>>

%-----------SUMMARY-----------
\section{Summary}
\small{<<SUMMARY>>}
\vspace{-4pt}

%-----------EDUCATION-----------
\section{Education}
  \resumeSubHeadingListStart
<<EDUCATION>>
  \resumeSubHeadingListEnd

%-----------EXPERIENCE-----------
\section{Experience}
  \resumeSubHeadingListStart
<<EXPERIENCE>>
  \resumeSubHeadingListEnd
\vspace{-16pt}

%-----------PROJECTS-----------
\section{Projects}
    \vspace{-5pt}
    \resumeSubHeadingListStart
<<PROJECTS>>
    \resumeSubHeadingListEnd
    \vspace{3pt}

%-----------TECHNICAL SKILLS-----------
\section{Technical Skills}
 \begin{itemize}[leftmargin=0.15in, label={}]
    \small{\item{
<<SKILLS>>
    }}
 \end{itemize}
 \vspace{-16pt}

%-----------CERTIFICATIONS-----------
<<CERTIFICATIONS>>

\end{document}
"""
