import re
import io
import pdfplumber
import pandas as pd
from datetime import datetime
import tkinter as tk
from tkinter import filedialog, messagebox
import sys
import os
import traceback

# For more flexible date parsing (handles many formats)
from dateutil import parser as dateparser

###############################################################################
#                             PATTERNS & CONSTANTS
###############################################################################

FOOTER_PATTERNS = [
    re.compile(r'^\s*page\s+\d+(\s+of\s+\d+)?\s*$', re.IGNORECASE),
    re.compile(r'.*system generated.*statement.*', re.IGNORECASE),
    re.compile(r'.*continued on next page.*', re.IGNORECASE),
]

# If the entire line matches these => skip as opening balance line
OPENING_BALANCE_PATTERNS = [
    re.compile(r'^\s*opening balance\s*$', re.IGNORECASE),
    re.compile(r'^\s*b/f\s*$', re.IGNORECASE),
    re.compile(r'^\s*balance brought forward\s*$', re.IGNORECASE),
]

# Possible synonyms for "Debit" or "Credit" columns
DEBIT_SYNONYMS = ["debit", "dr", "withdrawal"]
CREDIT_SYNONYMS = ["credit", "cr", "deposit", "receipt", "payment"]

###############################################################################
#                     STEP 1: PDF EXTRACTION LOGIC
###############################################################################

def attempt_table_extraction(pdf_path: str) -> list[list[str]]:
    """
    Attempt standard table extraction with pdfplumber's extract_tables().
    Return a list of rows, each row is list of cell strings.
    """
    rows = []
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                tables = page.extract_tables()
                if not tables:
                    continue
                for tbl in tables:
                    if not tbl:
                        continue
                    for row in tbl:
                        # Clean each cell
                        if row and any(cell for cell in row if cell):
                            cleaned = [(cell or "").strip() for cell in row]
                            rows.append(cleaned)
    except Exception as e:
        print("Table extraction error:", e)
    return rows

def attempt_bounding_box_extraction(pdf_path: str) -> list[list[str]]:
    """
    If table_extraction fails, attempt a bounding-box approach with extract_words.
    We'll:
      1) Extract all words with their x0, y0, x1, y1
      2) Cluster words into 'lines' based on y-coordinates
      3) Attempt to guess columns by x-coordinates

    This is a simplified approach. Real code may need more advanced logic to
    handle multi-line text, varied spacing, etc.
    """
    rows = []
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                words = page.extract_words()
                if not words:
                    continue

                # 1) Group words by approximate y-coordinate
                # We'll round y0 to nearest integer or so
                lines_dict = {}
                for w in words:
                    # e.g. w = {'x0': ..., 'top': y0, 'x1':..., 'bottom':..., 'text': 'xyz'}
                    # we cluster by "top"
                    y_approx = round(w["top"] / 5) * 5  # e.g. rounding
                    lines_dict.setdefault(y_approx, []).append(w)

                # Sort lines by y
                sorted_lines = sorted(lines_dict.items(), key=lambda x: x[0])

                # 2) For each line, sort words by x0
                for y_val, wds in sorted_lines:
                    wds_sorted = sorted(wds, key=lambda d: d["x0"])
                    # 3) We'll just create one row by splitting on big gaps
                    # but let's keep them as separate "cells"
                    row_texts = [wd["text"].strip() for wd in wds_sorted]
                    # row_texts might be multiple columns. We'll store them as is for now
                    # or you can do further logic to cluster by x-coord differences
                    rows.append(row_texts)
    except Exception as e:
        print("Bounding box extraction error:", e)
    return rows

def attempt_line_extraction_space_splitting(pdf_path: str) -> list[list[str]]:
    """
    Final fallback: read text line-by-line. For each line:
     - skip footers
     - split on >=2 spaces to guess columns
    Return list of row, each row is a list of columns.
    """
    rows = []
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if not text:
                    continue
                for ln in text.split("\n"):
                    ln = ln.strip()
                    if ln and not is_footer_line(ln):
                        # split on 2+ spaces
                        cols = re.split(r'\s{2,}', ln)
                        cleaned = [c.strip() for c in cols if c.strip()]
                        if cleaned:
                            rows.append(cleaned)
    except Exception as e:
        print("Line-based splitting error:", e)
    return rows

def is_footer_line(line: str) -> bool:
    low = line.lower().strip()
    for pat in FOOTER_PATTERNS:
        if pat.match(low):
            return True
    return False

def extract_pdf_data(pdf_path: str) -> list[list[str]]:
    """
    Step 1: Attempt:
      1) table_extraction
      2) bounding_box_extraction
      3) line_extraction_space_splitting
    Return the first successful result with enough rows.
    """
    # 1) Table
    table_rows = attempt_table_extraction(pdf_path)
    if len(table_rows) >= 2:
        return table_rows

    # 2) Bounding box approach
    bbox_rows = attempt_bounding_box_extraction(pdf_path)
    if len(bbox_rows) >= 2:
        return bbox_rows

    # 3) Fallback line-based splitting
    line_rows = attempt_line_extraction_space_splitting(pdf_path)
    return line_rows

###############################################################################
#                 STEP 2: COLUMN IDENTIFICATION (Heuristics)
###############################################################################

def parse_date_or_none(text: str):
    text = text.strip()
    if not text:
        return None
    try:
        dt = dateparser.parse(text, dayfirst=True)
        if dt:
            return dt.date()
    except:
        pass
    return None

def looks_like_strict_opening_balance(line_text: str) -> bool:
    # For skipping entire row if it EXACTLY matches
    low = line_text.lower().strip()
    for pat in OPENING_BALANCE_PATTERNS:
        if pat.match(low):
            return True
    return False

def identify_columns(rows: list[list[str]]) -> dict:
    """
    Heuristic approach:
      - Find possible date_col
      - Identify if we have separate 'debit' col, 'credit' col by looking at header synonyms
      - Or a single numeric col (maybe 'Amount')
      - Possibly find 'Balance' col
    We'll store them in a dict for parsing:

    {
      'date_col': int or None,
      'debit_col': int or None,
      'credit_col': int or None,
      'amount_col': int or None,
      'balance_col': int or None
    }
    """
    if not rows:
        return {}

    # We'll look at the first row or two to see if there's a header
    # We'll also do a quick date detection on first ~10 data rows
    col_count = max(len(r) for r in rows)
    if col_count == 0:
        return {}

    # Start with None
    col_map = {
        'date_col': None,
        'debit_col': None,
        'credit_col': None,
        'amount_col': None,
        'balance_col': None
    }

    # 1) Check header row (first or second row) for keywords
    possible_headers = rows[:2]  # check first two lines
    for hdr_row in possible_headers:
        for i, val in enumerate(hdr_row):
            low = val.lower().strip()
            if any(k in low for k in DEBIT_SYNONYMS) and col_map['debit_col'] is None:
                col_map['debit_col'] = i
            elif any(k in low for k in CREDIT_SYNONYMS) and col_map['credit_col'] is None:
                col_map['credit_col'] = i
            elif "balance" in low or "bal" in low:
                col_map['balance_col'] = i
            elif "date" in low and col_map['date_col'] is None:
                col_map['date_col'] = i
            elif any(k in low for k in ["amount", "amt"]):
                col_map['amount_col'] = i

    # 2) If we didn't find date_col from header, try scanning first ~10 data rows
    # for a col that consistently parses as date
    if col_map['date_col'] is None:
        date_candidate = find_most_likely_date_col(rows)
        if date_candidate is not None:
            col_map['date_col'] = date_candidate

    # 3) If we have no 'debit_col'/'credit_col' but there's 1 or 2 numeric columns,
    # we might store them as 'amount_col' or 'balance_col'
    # We'll do a quick numeric check
    numeric_col_candidates = find_numeric_cols(rows)
    # if we still have no debit/credit col, and no amount_col:
    if col_map['debit_col'] is None and col_map['credit_col'] is None:
        # maybe we have 1 numeric => amount
        # if we have 2 numeric => maybe last is balance
        if len(numeric_col_candidates) == 1:
            col_map['amount_col'] = numeric_col_candidates[0]
        elif len(numeric_col_candidates) >= 2:
            col_map['amount_col'] = numeric_col_candidates[0]
            col_map['balance_col'] = numeric_col_candidates[-1]

    return col_map

def find_most_likely_date_col(rows: list[list[str]]) -> int or None:
    """
    Check first ~10 data rows for a column that repeatedly parses as date
    """
    limit = min(10, len(rows))
    col_count = max(len(r) for r in rows)
    best_col = None
    best_score = 0
    for c in range(col_count):
        score = 0
        for i in range(limit):
            if c < len(rows[i]):
                val = rows[i][c].strip()
                if parse_date_or_none(val):
                    score += 1
        if score > best_score:
            best_score = score
            best_col = c
    # if best_score is 0 => no date col found
    if best_score == 0:
        return None
    return best_col

def find_numeric_cols(rows: list[list[str]]) -> list[int]:
    """
    Return indices of columns that frequently contain numeric data (int or float).
    We'll check first ~10 rows, if a col has numeric in at least half => candidate
    """
    limit = min(10, len(rows))
    col_count = max(len(r) for r in rows)
    numeric_cols = []
    for c in range(col_count):
        numeric_count = 0
        for i in range(limit):
            if c < len(rows[i]):
                val = rows[i][c].replace(",", "").strip().lower()
                # naive check for dr/cr or a float parse
                if val in ["dr","cr"] or val.replace(".","",1).isdigit():
                    numeric_count += 1
        # if at least half are numeric
        if numeric_count >= (limit/2):
            numeric_cols.append(c)
    return numeric_cols

###############################################################################
#     STEP 3: PARSE ROWS => {Date, Description, Amount, Balance, Type}
###############################################################################
def parse_rows_into_transactions(rows: list[list[str]], col_map: dict) -> list[dict]:
    """
    Use the identified columns: (date_col, debit_col, credit_col, amount_col, balance_col)
    For each row:
      - if it exactly matches an opening balance => skip
      - parse date from date_col
      - parse debit/credit => unify into Amount & Type
      - parse single Amount col if no separate debit/credit
      - parse Balance if present
      - everything else => Description
    If we can't parse date or numeric => skip row
    """
    txns = []

    dcol = col_map.get("date_col")
    debit_col = col_map.get("debit_col")
    credit_col = col_map.get("credit_col")
    amt_col = col_map.get("amount_col")
    bal_col = col_map.get("balance_col")

    for row in rows:
        joined_line = " ".join(row).strip().lower()
        if looks_like_strict_opening_balance(joined_line):
            # skip entire row
            continue

        # parse date
        trans_date = None
        if dcol is not None and dcol < len(row):
            trans_date = parse_date_or_none(row[dcol])

        # if no date => skip
        if not trans_date:
            continue

        # parse Amount & Type
        raw_amount = 0.0
        guess_type = None

        if debit_col is not None and debit_col < len(row):
            val_deb = row[debit_col].strip().lower()
            if val_deb:
                # parse numeric
                amt = convert_to_float(val_deb)
                if amt != 0.0:
                    raw_amount = abs(amt)
                    guess_type = "Payment"

        if credit_col is not None and credit_col < len(row):
            val_cred = row[credit_col].strip().lower()
            if val_cred:
                amt = convert_to_float(val_cred)
                if amt != 0.0:
                    raw_amount = abs(amt)
                    guess_type = "Receipt"

        # if still 0 => maybe single amt_col
        if raw_amount == 0.0 and amt_col is not None and amt_col < len(row):
            amt_val = convert_to_float(row[amt_col])
            if amt_val != 0.0:
                raw_amount = abs(amt_val)

        # parse Balance if present
        raw_balance = None
        if bal_col is not None and bal_col < len(row):
            bal_val = convert_to_float(row[bal_col])
            if bal_val != 0.0:
                raw_balance = bal_val
            else:
                # might be 0 if col is empty
                # store None
                pass

        # build Description from leftover columns
        used_cols = set()
        for c in [dcol, debit_col, credit_col, amt_col, bal_col]:
            if c is not None:
                used_cols.add(c)

        desc_cols = []
        for i, cell in enumerate(row):
            if i not in used_cols and cell.strip():
                desc_cols.append(cell.strip())
        description = " ".join(desc_cols)

        # if everything is 0 => skip
        if raw_amount == 0.0 and not guess_type and not raw_balance:
            # no numeric => skip
            continue

        txn = {
            "Date": trans_date,
            "Description": description,
            "Amount": raw_amount,
            "Balance": raw_balance,
        }
        if guess_type:
            txn["Type"] = guess_type

        txns.append(txn)

    return txns

def convert_to_float(val_str: str) -> float:
    """Convert various numeric formats to float, handle commas, possible - sign, etc."""
    val_str = val_str.replace(",", "").strip()
    # check if there's a minus sign => Payment
    sign = 1
    if val_str.startswith("-"):
        sign = -1
        val_str = val_str[1:]
    try:
        return sign * float(val_str)
    except:
        return 0.0

###############################################################################
#       STEP 4: CHECK IF REVERSED (WITHOUT SORT), THEN REVERSE IF NEEDED
###############################################################################
def fix_order_if_reversed(transactions: list[dict]) -> list[dict]:
    """
    We do NOT sort. We compare the first transaction's date vs. the last transaction's date.
    If first_date > last_date => it's newest->oldest => reverse the entire list.
    """
    if len(transactions) < 2:
        return transactions
    first_date = transactions[0].get("Date")
    last_date = transactions[-1].get("Date")
    if first_date and last_date and first_date > last_date:
        transactions.reverse()
    return transactions

###############################################################################
#   STEP 5: RUNNING BALANCE + RECEIPT/PAYMENT IDENTIFICATION (OPENING BALANCE)
###############################################################################
def check_if_balance_exists(transactions: list[dict]) -> bool:
    return any(txn.get("Balance") is not None for txn in transactions)

def running_balance_and_type(transactions: list[dict]):
    """
    If we have a 'Balance' in some transactions, we do:
      - two-way check => correct Amount if mismatch
      - derive Payment or Receipt from (prevBal +/- Amount => currBal)
    If no 'Balance' => rely on existing 'Type' (dr/cr or separate columns).
    If the statement claims an 'opening balance' as the very first row,
      we can interpret that row's 'Balance' as the initial. But we've
      skipped such row if it matched strictly. If you want to keep an
      explicit "Opening Balance" row, you'd parse it differently and
      store as a separate starting balance. 
    If we STILL have no 'Type' for the first row => default "Receipt."
    """
    if not check_if_balance_exists(transactions):
        # No balance => skip
        # We just rely on Dr/Cr detection or default "Receipt"
        for i, txn in enumerate(transactions):
            if "Type" not in txn or not txn["Type"]:
                txn["Type"] = "Receipt"  # final fallback
        return

    for i in range(1, len(transactions)):
        prev = transactions[i-1]
        curr = transactions[i]
        if prev["Balance"] is None or curr["Balance"] is None:
            continue

        raw_amt = abs(curr["Amount"])
        pay_balance = prev["Balance"] - raw_amt
        rec_balance = prev["Balance"] + raw_amt

        diff_pay = abs(pay_balance - (curr["Balance"] or 0.0))
        diff_rec = abs(rec_balance - (curr["Balance"] or 0.0))

        # whichever is smaller => that's the correct direction
        if diff_pay < 0.01 and diff_pay < diff_rec:
            curr["Type"] = "Payment"
        elif diff_rec < 0.01 and diff_rec < diff_pay:
            curr["Type"] = "Receipt"
        else:
            # mismatch => correct amount from the difference
            corrected_amt = abs((curr["Balance"] or 0) - (prev["Balance"] or 0))
            if abs((prev["Balance"] or 0) - corrected_amt - (curr["Balance"] or 0)) < 0.01:
                curr["Type"] = "Payment"
            else:
                curr["Type"] = "Receipt"
            curr["Amount"] = corrected_amt

    # If the first transaction has no Type => default
    if transactions and not transactions[0].get("Type"):
        transactions[0]["Type"] = "Receipt"

###############################################################################
#            STEP 6: EXPORT TO EXCEL
###############################################################################
def export_to_excel(transactions: list[dict], output_file="output.xlsx"):
    for i, txn in enumerate(transactions, start=1):
        txn["Sr No"] = i

    df = pd.DataFrame(transactions)

    col_order = ["Sr No", "Date", "Description", "Type", "Amount", "Balance"]
    for c in col_order:
        if c not in df.columns:
            df[c] = None

    df = df[col_order]

    # Convert Date => date only
    if not pd.api.types.is_datetime64_any_dtype(df["Date"]):
        df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    df["Date"] = df["Date"].dt.date

    df.to_excel(output_file, index=False)
    return output_file

###############################################################################
#                        MAIN PIPELINE
###############################################################################
def process_pdf_file(pdf_path: str):
    """Processing PDF with optimized performance"""
    suppress_ui = "flask_server.py" in sys.argv[0]
    try:
        print(f"[DEBUG] Processing PDF: {pdf_path}")

        if not os.path.exists(pdf_path):
            print("[❌ Error] PDF file not found:", pdf_path)
            if not suppress_ui:
                messagebox.showerror("Parsing Error", "PDF file not found.")
            return

        # Extract data with optimized settings
        with pdfplumber.open(pdf_path) as pdf:
            # Process pages in chunks for better memory usage
            rows = []
            for page in pdf.pages:
                # Try table extraction first (fastest)
                tables = page.extract_tables()
                if tables:
                    for table in tables:
                        if table and any(cell for cell in table[0] if cell):  # Check if table has content
                            rows.extend([[(cell or "").strip() for cell in row] for row in table])
                    continue  # Skip to next page if we found tables

                # If no tables, try line extraction (faster than bounding box)
                text = page.extract_text()
                if text:
                    for line in text.split("\n"):
                        line = line.strip()
                        if line and not is_footer_line(line):
                            cols = re.split(r'\s{2,}', line)
                            cleaned = [c.strip() for c in cols if c.strip()]
                            if cleaned:
                                rows.append(cleaned)

        if not rows:
            print("[❌ Error] No rows extracted.")
            if not suppress_ui:
                messagebox.showerror("Parsing Error", "No data could be extracted from PDF.")
            return

        # Process extracted data
        col_map = identify_columns(rows)
        if not col_map:
            print("[❌ Error] Failed to identify columns.")
            if not suppress_ui:
                messagebox.showerror("Column Error", "Failed to identify columns.")
            return

        transactions = parse_rows_into_transactions(rows, col_map)
        if not transactions:
            print("[❌ Error] No transactions found.")
            if not suppress_ui:
                messagebox.showerror("No Transactions", "No valid transactions found.")
            return

        # Order and balance processing
        fix_order_if_reversed(transactions)
        running_balance_and_type(transactions)

        # Export to Excel
        out_file = export_to_excel(transactions, "output.xlsx")
        print(f"[✓] Data exported to {out_file}")
        if not suppress_ui:
            messagebox.showinfo("Success", f"Data exported to {out_file}")

    except Exception as e:
        print(f"[❌ Critical Error in PDF Processing]: {e}")
        traceback.print_exc()
        if not suppress_ui:
            messagebox.showerror("Error", f"Failed to process PDF: {str(e)}")

###############################################################################
#                         TKINTER UI (Optional)
###############################################################################
def select_file():
    file_path = filedialog.askopenfilename(
        title="Select PDF File",
        filetypes=[("PDF Files", "*.pdf")]
    )
    if file_path:
        process_pdf_file(file_path)

def create_ui():
    root = tk.Tk()
    root.title("Bank Statement Processor - Bounding Box & Fallback")
    root.geometry("500x220")

    label = tk.Label(root, text="Upload a PDF bank statement to process:")
    label.pack(pady=10)

    btn = tk.Button(root, text="Select PDF File", command=select_file, width=20, height=2)
    btn.pack(pady=15)

    root.mainloop()

if __name__ == "__main__":
    create_ui()
