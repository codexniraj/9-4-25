from local_db_connector import LocalDbConnector

def main():
    db_connector = LocalDbConnector()

    # Step 1: User enters their email
    user_email = input("Enter your email: ").strip()

    # Step 2: Fetch and display companies associated with email
    companies = db_connector.get_user_companies(user_email)
    if not companies:
        print("No companies found for this user.")
        return

    print("\nCompanies associated with your account:")
    for idx, company in enumerate(companies, start=1):
        print(f"{idx}. {company['company_name']} (ID: {company['company_id']})")

    # Step 3: User selects a company
    company_choice = int(input("\nSelect a company by number: ")) - 1
    if company_choice < 0 or company_choice >= len(companies):
        print("Invalid choice. Exiting.")
        return

    selected_company_id = companies[company_choice]['company_id']
    selected_company_name = companies[company_choice]['company_name']

    # Step 4: Fetch and display bank accounts
    bank_accounts = db_connector.get_user_bank_accounts(user_email, selected_company_id)
    if not bank_accounts:
        print(f"\nNo bank accounts found for company '{selected_company_name}'.")
        return

    print(f"\nBank accounts for '{selected_company_name}':")
    for account in bank_accounts:
        print(f"- {account}")

if __name__ == "__main__":
    main()
