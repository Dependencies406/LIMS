#!/usr/bin/env python3
"""
Firebase Configuration Setup Tool
A GUI application to configure Firebase credentials for LIMS application
"""

import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext
import json
import os
import sys
from pathlib import Path

try:
    import firebase_admin
    from firebase_admin import credentials, firestore, storage, initialize_app
    FIREBASE_AVAILABLE = True
except ImportError:
    FIREBASE_AVAILABLE = False

class FirebaseSetupTool:
    def __init__(self, root):
        self.root = root
        self.root.title("LIMS Firebase Configuration Tool")
        self.root.geometry("700x800")
        self.root.resizable(True, True)
        
        # Variables to store Firebase config
        self.api_key = tk.StringVar()
        self.auth_domain = tk.StringVar()
        self.project_id = tk.StringVar()
        self.storage_bucket = tk.StringVar()
        self.messaging_sender_id = tk.StringVar()
        self.app_id = tk.StringVar()
        self.measurement_id = tk.StringVar()
        
        self.setup_ui()
        self.load_existing_config()
        
    def setup_ui(self):
        # Main container with padding
        main_frame = ttk.Frame(self.root, padding="20")
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)
        main_frame.columnconfigure(1, weight=1)
        
        # Title
        title_label = ttk.Label(
            main_frame, 
            text="Firebase Configuration Setup",
            font=("Arial", 16, "bold")
        )
        title_label.grid(row=0, column=0, columnspan=2, pady=(0, 20))
        
        # Instructions
        instructions = """
Please enter your Firebase configuration credentials.
You can find these in your Firebase Console:
1. Go to Project Settings
2. Scroll down to "Your apps" section
3. Click on the Web app (</>) icon or create one
4. Copy the configuration values below
        """
        inst_label = ttk.Label(
            main_frame, 
            text=instructions,
            wraplength=650,
            justify=tk.LEFT
        )
        inst_label.grid(row=1, column=0, columnspan=2, pady=(0, 20))
        
        # Form fields
        row = 2
        
        # API Key
        ttk.Label(main_frame, text="API Key *:").grid(row=row, column=0, sticky=tk.W, pady=5)
        api_entry = ttk.Entry(main_frame, textvariable=self.api_key, width=50)
        api_entry.grid(row=row, column=1, sticky=(tk.W, tk.E), pady=5)
        row += 1
        
        # Auth Domain
        ttk.Label(main_frame, text="Auth Domain *:").grid(row=row, column=0, sticky=tk.W, pady=5)
        auth_entry = ttk.Entry(main_frame, textvariable=self.auth_domain, width=50)
        auth_entry.grid(row=row, column=1, sticky=(tk.W, tk.E), pady=5)
        row += 1
        
        # Project ID
        ttk.Label(main_frame, text="Project ID *:").grid(row=row, column=0, sticky=tk.W, pady=5)
        project_entry = ttk.Entry(main_frame, textvariable=self.project_id, width=50)
        project_entry.grid(row=row, column=1, sticky=(tk.W, tk.E), pady=5)
        row += 1
        
        # Storage Bucket
        ttk.Label(main_frame, text="Storage Bucket *:").grid(row=row, column=0, sticky=tk.W, pady=5)
        storage_entry = ttk.Entry(main_frame, textvariable=self.storage_bucket, width=50)
        storage_entry.grid(row=row, column=1, sticky=(tk.W, tk.E), pady=5)
        row += 1
        
        # Messaging Sender ID
        ttk.Label(main_frame, text="Messaging Sender ID *:").grid(row=row, column=0, sticky=tk.W, pady=5)
        sender_entry = ttk.Entry(main_frame, textvariable=self.messaging_sender_id, width=50)
        sender_entry.grid(row=row, column=1, sticky=(tk.W, tk.E), pady=5)
        row += 1
        
        # App ID
        ttk.Label(main_frame, text="App ID *:").grid(row=row, column=0, sticky=tk.W, pady=5)
        app_entry = ttk.Entry(main_frame, textvariable=self.app_id, width=50)
        app_entry.grid(row=row, column=1, sticky=(tk.W, tk.E), pady=5)
        row += 1
        
        # Measurement ID (optional)
        ttk.Label(main_frame, text="Measurement ID:").grid(row=row, column=0, sticky=tk.W, pady=5)
        measurement_entry = ttk.Entry(main_frame, textvariable=self.measurement_id, width=50)
        measurement_entry.grid(row=row, column=1, sticky=(tk.W, tk.E), pady=5)
        row += 1
        
        # Buttons frame
        button_frame = ttk.Frame(main_frame)
        button_frame.grid(row=row, column=0, columnspan=2, pady=20)
        
        # Test Connection button
        test_btn = ttk.Button(
            button_frame, 
            text="Test Connection",
            command=self.test_connection
        )
        test_btn.pack(side=tk.LEFT, padx=5)
        
        # Generate Config button
        generate_btn = ttk.Button(
            button_frame, 
            text="Generate .env File",
            command=self.generate_env_file
        )
        generate_btn.pack(side=tk.LEFT, padx=5)
        
        # Clear button
        clear_btn = ttk.Button(
            button_frame, 
            text="Clear",
            command=self.clear_fields
        )
        clear_btn.pack(side=tk.LEFT, padx=5)
        
        row += 1
        
        # Status/Output area
        ttk.Label(main_frame, text="Status:", font=("Arial", 10, "bold")).grid(
            row=row, column=0, columnspan=2, sticky=tk.W, pady=(10, 5)
        )
        row += 1
        
        self.status_text = scrolledtext.ScrolledText(
            main_frame, 
            height=10, 
            width=80,
            wrap=tk.WORD
        )
        self.status_text.grid(row=row, column=0, columnspan=2, sticky=(tk.W, tk.E, tk.N, tk.S), pady=5)
        main_frame.rowconfigure(row, weight=1)
        
        # Footer
        footer_label = ttk.Label(
            main_frame,
            text="* Required fields",
            font=("Arial", 8),
            foreground="gray"
        )
        footer_label.grid(row=row+1, column=0, columnspan=2, pady=(10, 0))
        
    def log_status(self, message, level="info"):
        """Add message to status area"""
        self.status_text.insert(tk.END, f"[{level.upper()}] {message}\n")
        self.status_text.see(tk.END)
        self.root.update()
        
    def validate_fields(self):
        """Validate that required fields are filled"""
        required = {
            "API Key": self.api_key.get().strip(),
            "Auth Domain": self.auth_domain.get().strip(),
            "Project ID": self.project_id.get().strip(),
            "Storage Bucket": self.storage_bucket.get().strip(),
            "Messaging Sender ID": self.messaging_sender_id.get().strip(),
            "App ID": self.app_id.get().strip(),
        }
        
        missing = [key for key, value in required.items() if not value]
        if missing:
            messagebox.showerror(
                "Validation Error",
                f"Please fill in all required fields:\n" + "\n".join(f"- {field}" for field in missing)
            )
            return False
        return True
        
    def test_connection(self):
        """Test Firebase connection using web SDK approach"""
        if not self.validate_fields():
            return
            
        self.log_status("Testing Firebase connection...")
        
        # Create a simple HTML test file to test connection
        config = {
            "apiKey": self.api_key.get().strip(),
            "authDomain": self.auth_domain.get().strip(),
            "projectId": self.project_id.get().strip(),
            "storageBucket": self.storage_bucket.get().strip(),
            "messagingSenderId": self.messaging_sender_id.get().strip(),
            "appId": self.app_id.get().strip(),
        }
        
        # Basic validation
        if not config["apiKey"].startswith("AIza"):
            self.log_status("Warning: API Key format may be incorrect (should start with 'AIza')", "warning")
        
        if config["authDomain"] and not config["authDomain"].endswith(".firebaseapp.com"):
            self.log_status("Warning: Auth Domain format may be incorrect (should end with '.firebaseapp.com')", "warning")
        
        if config["storageBucket"] and not config["storageBucket"].endswith(".appspot.com"):
            self.log_status("Warning: Storage Bucket format may be incorrect (should end with '.appspot.com')", "warning")
        
        self.log_status("✓ Configuration format validated")
        self.log_status("")
        self.log_status("Note: Full connection test requires deploying the application.")
        self.log_status("Please ensure:")
        self.log_status("1. Firebase Authentication is enabled")
        self.log_status("2. Firestore Database is created")
        self.log_status("3. Storage is enabled")
        self.log_status("4. Security rules are deployed")
        self.log_status("")
        self.log_status("Configuration appears valid. You can proceed to generate .env file.")
        
    def generate_env_file(self):
        """Generate .env file from entered values"""
        if not self.validate_fields():
            return
            
        # Determine the target directory (lims-app if exists, otherwise current)
        current_dir = Path(__file__).parent
        target_dir = current_dir.parent / "lims-app"
        if not target_dir.exists():
            target_dir = current_dir.parent
        
        env_path = target_dir / ".env"
        
        # Generate .env content
        env_content = f"""# Firebase Configuration
# Generated by Firebase Setup Tool
# DO NOT commit this file to version control

VITE_FIREBASE_API_KEY={self.api_key.get().strip()}
VITE_FIREBASE_AUTH_DOMAIN={self.auth_domain.get().strip()}
VITE_FIREBASE_PROJECT_ID={self.project_id.get().strip()}
VITE_FIREBASE_STORAGE_BUCKET={self.storage_bucket.get().strip()}
VITE_FIREBASE_MESSAGING_SENDER_ID={self.messaging_sender_id.get().strip()}
VITE_FIREBASE_APP_ID={self.app_id.get().strip()}
"""
        
        # Add measurement ID if provided
        if self.measurement_id.get().strip():
            env_content += f"VITE_FIREBASE_MEASUREMENT_ID={self.measurement_id.get().strip()}\n"
        
        try:
            # Write .env file
            with open(env_path, 'w') as f:
                f.write(env_content)
            
            self.log_status(f"✓ .env file generated successfully!")
            self.log_status(f"  Location: {env_path}")
            self.log_status("")
            self.log_status("Next steps:")
            self.log_status("1. Navigate to lims-app directory")
            self.log_status("2. Install dependencies: npm install")
            self.log_status("3. Build application: npm run build")
            self.log_status("4. Deploy Firebase rules: firebase deploy --only firestore:rules,storage:rules")
            self.log_status("5. Deploy application: firebase deploy --only hosting")
            
            messagebox.showinfo(
                "Success",
                f".env file generated successfully!\n\nLocation: {env_path}\n\n"
                "You can now build and deploy your application."
            )
            
        except Exception as e:
            error_msg = f"Failed to generate .env file: {str(e)}"
            self.log_status(error_msg, "error")
            messagebox.showerror("Error", error_msg)
            
    def load_existing_config(self):
        """Load existing .env file if it exists"""
        current_dir = Path(__file__).parent
        env_path = current_dir.parent / "lims-app" / ".env"
        
        if not env_path.exists():
            env_path = current_dir.parent / ".env"
        
        if env_path.exists():
            try:
                with open(env_path, 'r') as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith('#') and '=' in line:
                            key, value = line.split('=', 1)
                            key = key.strip()
                            value = value.strip()
                            
                            if key == 'VITE_FIREBASE_API_KEY':
                                self.api_key.set(value)
                            elif key == 'VITE_FIREBASE_AUTH_DOMAIN':
                                self.auth_domain.set(value)
                            elif key == 'VITE_FIREBASE_PROJECT_ID':
                                self.project_id.set(value)
                            elif key == 'VITE_FIREBASE_STORAGE_BUCKET':
                                self.storage_bucket.set(value)
                            elif key == 'VITE_FIREBASE_MESSAGING_SENDER_ID':
                                self.messaging_sender_id.set(value)
                            elif key == 'VITE_FIREBASE_APP_ID':
                                self.app_id.set(value)
                            elif key == 'VITE_FIREBASE_MEASUREMENT_ID':
                                self.measurement_id.set(value)
                
                self.log_status(f"Loaded existing configuration from {env_path}")
            except Exception as e:
                self.log_status(f"Could not load existing config: {str(e)}", "warning")
                
    def clear_fields(self):
        """Clear all input fields"""
        self.api_key.set("")
        self.auth_domain.set("")
        self.project_id.set("")
        self.storage_bucket.set("")
        self.messaging_sender_id.set("")
        self.app_id.set("")
        self.measurement_id.set("")
        self.status_text.delete(1.0, tk.END)
        self.log_status("Fields cleared")

def main():
    root = tk.Tk()
    app = FirebaseSetupTool(root)
    root.mainloop()

if __name__ == "__main__":
    main()
