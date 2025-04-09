# line_identifier.py

import tkinter as tk
from tkinter import filedialog, messagebox
import pdfplumber
import pandas as pd

def extract_lines_to_excel(pdf_path, output_path):
    """
    Extract all lines from the PDF into an Excel file, each line in a separate row,
    so the user can see what lines appear in the statement.
    """
    lines = []
    with pdfplumber.open(pdf_path) as pdf:
        for page_idx, page in enumerate(pdf.pages, start=1):
            text = page.extract_text()
            if text:
                page_lines = text.split('\n')
                for ln_idx, ln in enumerate(page_lines, start=1):
                    lines.append({
                        "Page #": page_idx,
                        "Line #": ln_idx,
                        "Content": ln.strip()
                    })

    df = pd.DataFrame(lines, columns=["Page #", "Line #", "Content"])
    df.to_excel(output_path, index=False)

def on_select_pdf(pdf_path_var):
    file_path = filedialog.askopenfilename(
        title="Select PDF File",
        filetypes=[("PDF Files", "*.pdf"), ("All Files", "*.*")]
    )
    if file_path:
        pdf_path_var.set(file_path)

def on_extract(pdf_path_var):
    pdf_file = pdf_path_var.get().strip()
    if not pdf_file:
        messagebox.showwarning("Warning", "Please select a PDF file first.")
        return

    save_path = filedialog.asksaveasfilename(
        title="Save Excel File",
        defaultextension=".xlsx",
        filetypes=[("Excel Files", "*.xlsx"), ("All Files", "*.*")]
    )
    if not save_path:
        return

    extract_lines_to_excel(pdf_file, save_path)
    messagebox.showinfo("Success", f"All lines have been saved to: {save_path}")

def main():
    root = tk.Tk()
    root.title("Line Identifier Tool")
    root.geometry("600x150")

    pdf_path_var = tk.StringVar()

    lbl = tk.Label(root, text="Select a PDF to extract all lines:")
    lbl.pack(pady=10)

    frame_select = tk.Frame(root)
    frame_select.pack(pady=5)

    entry_pdf = tk.Entry(frame_select, textvariable=pdf_path_var, width=50)
    entry_pdf.pack(side=tk.LEFT, padx=5)

    btn_browse = tk.Button(frame_select, text="Select PDF", command=lambda: on_select_pdf(pdf_path_var))
    btn_browse.pack(side=tk.LEFT, padx=5)

    btn_extract = tk.Button(root, text="Extract to Excel", command=lambda: on_extract(pdf_path_var))
    btn_extract.pack(pady=20)

    root.mainloop()

if __name__ == "__main__":
    main()
