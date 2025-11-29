# How to Deploy Your Project to GitHub

This guide will walk you through the steps to upload your project code to a new repository on GitHub.

## Prerequisites

1.  **A GitHub Account:** If you don't have one, you can sign up for free at [github.com](https://github.com).
2.  **Git Installed:** You need to have Git installed on your local machine. You can download it from [git-scm.com](https://git-scm.com/downloads).

## Step-by-Step Instructions

Follow these steps in your project's terminal to get your code onto GitHub.

### 1. Create a New Repository on GitHub

- Go to [github.com](https://github.com) and log in.
- Click the **+** icon in the top-right corner and select **"New repository"**.
- Give your repository a name (e.g., `fest-central-app`).
- You can add a description, but leave the other options (like adding a README, .gitignore, or license) unchecked, as your project already has these files.
- Click **"Create repository"**.

GitHub will show you a page with some commands. You'll use the URL from this page in the steps below. It will look something like `https://github.com/your-username/your-repository-name.git`.

### 2. Initialize a Git Repository in Your Project

Open your terminal, make sure you are in your project's root directory, and run the following command. This will create a new, hidden `.git` folder to track your project's history.

```bash
git init
```

### 3. Add All Files to Staging

This command stages all the files in your project, preparing them for the first commit.

```bash
git add .
```

### 4. Make Your First Commit

A commit is a snapshot of your code at a specific point in time. This command saves your staged files with a descriptive message.

```bash
git commit -m "Initial commit"
```

### 5. Set the Default Branch Name

It's standard practice to name the main branch `main`.

```bash
git branch -M main
```

### 6. Add Your GitHub Repository as a Remote

This command tells Git where to send your code when you push it. Replace `<YOUR_REPOSITORY_URL>` with the URL you copied from your GitHub repository page.

```bash
git remote add origin <YOUR_REPOSITORY_URL>
```
*Example:* `git remote add origin https://github.com/your-username/fest-central-app.git`

### 7. Push Your Code to GitHub

This final command uploads your code from your local machine to the `main` branch on GitHub.

```bash
git push -u origin main
```

That's it! If you refresh your repository page on GitHub, you will see all of your project files. From now on, you can use `git push` to upload any new changes.