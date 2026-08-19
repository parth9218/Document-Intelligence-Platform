import os
import subprocess
import sys
from dotenv import load_dotenv

def main():
    # Load settings from worker's local .env
    worker_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    dotenv_path = os.path.join(worker_dir, ".env")
    if os.path.exists(dotenv_path):
        load_dotenv(dotenv_path)
    else:
        load_dotenv()

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("Error: DATABASE_URL not set in environment or apps/worker/.env file.")
        sys.exit(1)

    # Strip query parameters like schema=public if present for SQLAlchemy
    if "?" in database_url:
        database_url = database_url.split("?")[0]

    outfile = os.path.join(worker_dir, "app", "models", "generated_models.py")
    
    print(f"Generating SQLAlchemy models from database...")
    print(f"Writing to: {outfile}")

    # Run sqlacodegen using the venv executable
    venv_bin = os.path.join(worker_dir, "venv", "bin", "sqlacodegen")
    if not os.path.exists(venv_bin):
        # Fallback to standard path execution
        venv_bin = "sqlacodegen"

    cmd = [
        venv_bin,
        "--generator", "declarative",
        database_url,
        "--outfile", outfile
    ]

    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
        print("SQLAlchemy models generated successfully!")
        
        # Post-process generated_models.py to inject type_annotation_map into Base class
        if os.path.exists(outfile):
            with open(outfile, "r") as f:
                content = f.read()

            target = "class Base(DeclarativeBase):\n    pass"
            replacement = "class Base(DeclarativeBase):\n    type_annotation_map = {\n        Any: NullType\n    }"
            
            if target in content:
                content = content.replace(target, replacement)
                with open(outfile, "w") as f:
                    f.write(content)
                print("Injected Any type mapping in Base class successfully.")
            else:
                print("Any type mapping in Base class is already present or custom-mapped.")
                
    except subprocess.CalledProcessError as e:
        print(f"Error running sqlacodegen: {e}")
        print(f"Stdout: {e.stdout}")
        print(f"Stderr: {e.stderr}")
        sys.exit(1)

if __name__ == "__main__":
    main()
