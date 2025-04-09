import os
import threading
import logging
import jwt  # Requires: pip install pyjwt
    
import webbrowser
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, QLabel,
    QLineEdit, QPushButton, QStackedWidget, QTableWidget, QTableWidgetItem, QMessageBox
)
from PyQt6.QtGui import QPainter, QBrush, QColor, QFont
from PyQt6.QtCore import Qt, pyqtSignal, QTimer, QUrl
from PyQt6.QtWebSockets import QWebSocket
from dotenv import load_dotenv
from hardware import get_hardware_id


# from db_connector import get_license_hardware
# from db_connector import update_license_hardware

# Load environment variables
load_dotenv()

# Import backend modules
from tally_api import TallyAPI
from db_connector import AwsDbConnector  # Existing AWS connector
from cognito_auth import CognitoAuth
from config import COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID, COGNITO_REGION

# Import the local storage connector for silver users
from local_db_connector import LocalDbConnector

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# Define the URLs for the live and local websites.
LIVE_WEBSITE_URL = os.getenv("LIVE_WEBSITE_URL", "https://live.example.com")
LOCAL_WEBSITE_URL = os.getenv("LOCAL_WEBSITE_URL", "http://localhost:9000")

class UserIcon(QWidget):
    """A widget that draws a circular icon with the username initial."""
    def __init__(self, username, size=40):
        super().__init__()
        self.username = username[0].upper()
        self.size = size
        self.setFixedSize(self.size, self.size)

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        painter.setBrush(QBrush(QColor("lightblue")))
        painter.drawEllipse(0, 0, self.size, self.size)
        painter.setPen(QColor("black"))
        font = QFont("Arial", 10, QFont.Weight.Bold)
        painter.setFont(font)
        painter.drawText(self.rect(), Qt.AlignmentFlag.AlignCenter, self.username)

class LoginWidget(QWidget):
    """Login/Signup screen using PyQt6 and AWS Cognito."""
    # Emits both username and user_type after a successful login
    switch_to_main_signal = pyqtSignal(str, str)

    def __init__(self, cognito_auth):
        super().__init__()
        self.cognito_auth = cognito_auth
        self.setup_ui()

    def setup_ui(self):
        layout = QVBoxLayout()
        self.setLayout(layout)

        title = QLabel("Login - Tally Connector")
        title.setFont(QFont("Arial", 16, QFont.Weight.Bold))
        title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(title)

        self.username_edit = QLineEdit()
        self.username_edit.setPlaceholderText("Email")
        layout.addWidget(self.username_edit)

        self.password_edit = QLineEdit()
        self.password_edit.setPlaceholderText("Password")
        self.password_edit.setEchoMode(QLineEdit.EchoMode.Password)
        layout.addWidget(self.password_edit)

        btn_layout = QHBoxLayout()
        login_btn = QPushButton("Login")
        login_btn.clicked.connect(self.login)
        btn_layout.addWidget(login_btn)

        signup_btn = QPushButton("Sign Up")
        signup_btn.clicked.connect(self.signup)
        btn_layout.addWidget(signup_btn)

        layout.addLayout(btn_layout)

    def login(self):
        username = self.username_edit.text().strip()
        password = self.password_edit.text().strip()
        success, response = self.cognito_auth.sign_in(username, password)
        if success:
            # Extract the groups from the ID token
            try:
                id_token = response['AuthenticationResult']['IdToken']
                decoded = jwt.decode(id_token, options={"verify_signature": False})
                groups = decoded.get("cognito:groups", [])
            except Exception as e:
                logging.error("Error decoding token: %s", e)
                groups = []
            # Determine user tier based on groups
            user_type = "gold" if any("gold" == group.lower() for group in groups) else "silver"
            self.switch_to_main_signal.emit(username, user_type)
        else:
            QMessageBox.critical(self, "Login Failed", "Incorrect username or password.")

    def signup(self):
        username = self.username_edit.text().strip()
        password = self.password_edit.text().strip()
        success, response = self.cognito_auth.sign_up(username, password)
        if success:
            QMessageBox.information(self, "Sign Up", "Account created. Please check your email to confirm your account and then log in.")
        else:
            QMessageBox.critical(self, "Sign Up Failed", "An error occurred. Try a different username.")

class LedgerWidget(QWidget):
    """Main ledger view that displays Tally ledger data and stores it based on user tier."""
    ledgers_fetched = pyqtSignal(str, list)  # Emits (active_company, ledgers)

    def __init__(self, username, tally_api, db_connector, user_type):
        super().__init__()
        self.username = username
        self.user_type = user_type  # 'gold' or 'silver'
        self.tally_api = tally_api
        self.db_connector = db_connector
        # For silver users, initialize the local DB connector.
        if self.user_type == "silver":
            self.local_db_connector = LocalDbConnector()
        self.ledgers = []  # Store fetched ledger data temporarily
        self.setup_ui()
        self.ledgers_fetched.connect(self.on_ledgers_fetched)

    def setup_ui(self):
        main_layout = QVBoxLayout()
        self.setLayout(main_layout)

        # Top bar with title, user type indicator and user icon
        top_bar = QHBoxLayout()
        title = QLabel("Tally Connector")
        title.setFont(QFont("Arial", 16, QFont.Weight.Bold))
        top_bar.addWidget(title)
        top_bar.addStretch()

        # User type label in right corner
        self.user_type_label = QLabel(self.user_type.upper())
        self.user_type_label.setFont(QFont("Arial", 12, QFont.Weight.Bold))
        # Optionally set a color style based on tier
        if self.user_type == "gold":
            self.user_type_label.setStyleSheet("color: green;")
        else:
            self.user_type_label.setStyleSheet("color: blue;")
        top_bar.addWidget(self.user_type_label)

        # TDL Section Button
        tdl_btn = QPushButton("TDL Section")
        tdl_btn.clicked.connect(self.open_tdl_section)
        top_bar.addWidget(tdl_btn)

        self.user_icon = UserIcon(self.username)
        self.user_icon.mousePressEvent = self.open_profile
        top_bar.addWidget(self.user_icon)
        main_layout.addLayout(top_bar)

        self.company_label = QLabel("Company: Please click Refresh to load data")
        self.company_label.setFont(QFont("Arial", 12, QFont.Weight.Bold))
        main_layout.addWidget(self.company_label)

        # Table with three columns: Ledger Name, Closing Balance, Parent
        self.table = QTableWidget(0, 3)
        self.table.setHorizontalHeaderLabels(["Ledger Name", "Closing Balance", "Parent"])
        main_layout.addWidget(self.table)

        btn_layout = QHBoxLayout()
        self.refresh_btn = QPushButton("Refresh")
        self.refresh_btn.clicked.connect(self.update_ledgers)
        btn_layout.addWidget(self.refresh_btn)

        # For gold users, add a separate Sync button.
        if self.user_type == "gold":
            self.sync_btn = QPushButton("Sync")
            self.sync_btn.clicked.connect(self.sync_data)
            btn_layout.addWidget(self.sync_btn)

        self.logout_btn = QPushButton("Logout")
        btn_layout.addWidget(self.logout_btn)
        main_layout.addLayout(btn_layout)

    def open_tdl_section(self):
        os.system("python TdlDisplay.py")
        
    def update_ledgers(self):
        def fetch_data():
            if not self.tally_api.is_tally_running():
                self.ledgers_fetched.emit("Tally not running", [])
                return
            active_company = self.tally_api.get_active_company()
            # Request ledger name, parent, and closing balance fields
            fetch_fields = ["LEDGERNAME", "PARENT", "CLOSINGBALANCE"]
            ledgers = self.tally_api.fetch_data(
                request_id="AllLedgers",
                collection_type="Ledger",
                fetch_fields=fetch_fields,
                use_cache=False
            )
            self.ledgers = ledgers
            self.ledgers_fetched.emit(active_company, ledgers)
            # Depending on the user tier, store the data:
            if self.user_type == "gold":
                # Gold user: store in cloud (using AWS DB connector)
                self.db_connector.upload_ledgers(self.username, active_company, ledgers)
            else:
                # Silver user: store locally
                self.local_db_connector.upload_ledgers(self.username, active_company, ledgers)
                # Schedule a popup (on the main thread) to invite user to open the local website
                QTimer.singleShot(0, self.show_local_website_popup)
        threading.Thread(target=fetch_data, daemon=True).start()

    def show_local_website_popup(self):
        reply = QMessageBox.question(
            self,
            "Local Website",
            "Data stored locally. Do you want to visit your local website?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        if reply == QMessageBox.StandardButton.Yes:
            webbrowser.open(LOCAL_WEBSITE_URL)

    def sync_data(self):
        # This method is for gold users, triggered by the Sync button.
        reply = QMessageBox.question(
            self,
            "Live Website",
            "Data stored in the cloud. Do you want to visit our live website?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        if reply == QMessageBox.StandardButton.Yes:
            webbrowser.open(LIVE_WEBSITE_URL)

    def on_ledgers_fetched(self, active_company, ledgers):
        self.company_label.setText(f"Company: {active_company}")
        self.table.setRowCount(0)
        for ledger in ledgers:
            row = self.table.rowCount()
            self.table.insertRow(row)
            ledger_name = ledger.get("Name", ledger.get("LEDGERNAME", "N/A"))
            closing_balance = ledger.get("ClosingBalance", ledger.get("CLOSINGBALANCE", "N/A"))
            parent = ledger.get("PARENT", "N/A")
            self.table.setItem(row, 0, QTableWidgetItem(ledger_name))
            self.table.setItem(row, 1, QTableWidgetItem(closing_balance))
            self.table.setItem(row, 2, QTableWidgetItem(parent))

    def open_profile(self, event):
        QMessageBox.information(self, "Profile", f"Username: {self.username}\n(Additional profile info here)")

class MainWindow(QMainWindow):
    """Main application window using QStackedWidget to switch between login and ledger screens."""
    def __init__(self, tally_api, db_connector, cognito_auth):
        super().__init__()
        self.tally_api = tally_api
        self.db_connector = db_connector
        self.cognito_auth = cognito_auth
        self.setWindowTitle("Tally Connector")
        self.resize(800, 600)
        self.stacked = QStackedWidget()
        self.setCentralWidget(self.stacked)
        
        # Add a status label to the status bar
        self.status_label = QLabel("WebSocket Status: Connecting...")
        self.statusBar().addWidget(self.status_label)

        # Initialize WebSocket
        self.ws = None
        self.connect_websocket()

        # Setup login widget
        self.login_widget = LoginWidget(self.cognito_auth)
        self.login_widget.switch_to_main_signal.connect(self.switch_to_ledger)
        self.stacked.addWidget(self.login_widget)

    def connect_websocket(self):
        if self.ws:
            self.ws.close()
        
        self.ws = QWebSocket()
        self.ws.connected.connect(self.on_ws_connected)
        self.ws.disconnected.connect(self.on_ws_disconnected)
        self.ws.errorOccurred.connect(self.on_ws_error)
        
        try:
            self.ws.open(QUrl("ws://localhost:8000/"))
        except Exception as e:
            logging.error(f"Failed to open WebSocket connection: {str(e)}")
            self.status_label.setText("WebSocket Status: Connection Failed")

    def on_ws_connected(self):
        self.status_label.setText("WebSocket Status: Connected")
        logging.info("WebSocket connected successfully")

    def on_ws_error(self, error):
        error_msg = self.ws.errorString()
        self.status_label.setText(f"WebSocket Status: Error - {error_msg}")
        logging.error("WebSocket error: %s", error_msg)
        
        # Schedule a reconnection attempt
        from PyQt6.QtCore import QTimer
        QTimer.singleShot(5000, self.connect_websocket)

    def on_ws_disconnected(self):
        self.status_label.setText("WebSocket Status: Disconnected")
        logging.info("WebSocket disconnected")
        
        # Schedule a reconnection attempt
        from PyQt6.QtCore import QTimer
        QTimer.singleShot(5000, self.connect_websocket)

    def switch_to_ledger(self, username, user_type):
        if user_type == "silver":
            current_hwid = get_hardware_id()
            # Ensure a user record exists:
            self.db_connector.create_user_if_not_exists(username)
            registered_hwid, detected_hwid = self.db_connector.get_license_hardware(username)
            if registered_hwid is None or registered_hwid.strip() == "":
                # First-time login: store the current hardware ID as the registered hardware.
                self.db_connector.create_license_record(username, current_hwid)
                # self.db_connector.update_license_hardware(username, current_hwid)
            elif registered_hwid != current_hwid:
                # Hardware mismatch: update the detectedhardwareid column with the new hardware ID.
                self.db_connector.update_detected_hardware(username, current_hwid)
                QMessageBox.critical(
                    self,
                    "Hardware Mismatch",
                    ("Your current hardware does not match the registered machine. "
                    "The new hardware has been recorded in the license record. "
                    "Please contact support if you wish to shift your license.")
                )
                self.switch_to_login()
                return

        # Proceed with login if hardware check passes (or for gold users)
        self.ledger_widget = LedgerWidget(username, self.tally_api, self.db_connector, user_type)
        self.ledger_widget.logout_btn.clicked.connect(self.switch_to_login)
        self.stacked.addWidget(self.ledger_widget)
        self.stacked.setCurrentWidget(self.ledger_widget)

    def switch_to_login(self):
        self.stacked.setCurrentWidget(self.login_widget)

    def closeEvent(self, event):
        if self.ws:
            self.ws.close()
        super().closeEvent(event)

def main():
    from PyQt6.QtWidgets import QApplication
    import subprocess
    import time
    import sys
    # Initialize backend dependencies

    logging.info("Starting Flask Server...")
    flask_process = subprocess.Popen([sys.executable, "flask_server.py"])

    #give the server time to start
    time.sleep(2)

    #Initialized backend dependencies
    tally_api = TallyAPI()
    try:
        db_connector = AwsDbConnector()
    except Exception as ve:
        logging.error("Database configuration error: %s", ve)
        return
    cognito_auth = CognitoAuth(COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID, COGNITO_REGION)

    app = QApplication([])
    window = MainWindow(tally_api, db_connector, cognito_auth)
    window.show()

    try:
        app.exec()
    finally:
        flask_process.terminate()
        flask_process.wait()
        
if __name__ == "__main__":
    main()
