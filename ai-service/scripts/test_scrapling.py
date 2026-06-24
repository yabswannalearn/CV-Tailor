import sys
from scrapling import Fetcher

def main():
    # Use LinkedIn jobs as a default hard test case for anti-bot
    url = "https://www.linkedin.com/jobs/"
    if len(sys.argv) > 1:
        url = sys.argv[1]
        
    print(f"[*] Attempting to fetch: {url}")
    print("[*] Initializing Scrapling fetcher (this may download Camoufox on the first run)...")
    
    try:
        # headless=True will run without opening a visible browser window
        fetcher = Fetcher(headless=True)
        response = fetcher.get(url)
        
        print("\n--- FETCH RESULTS ---")
        print(f"Status Code: {response.status}")
        
        # Get raw HTML body
        body_text = response.body.decode('utf-8', errors='ignore')
        
        # Simple title extraction
        import re
        title_match = re.search(r'<title>(.*?)</title>', body_text, re.IGNORECASE)
        title_text = title_match.group(1) if title_match else "No title found"
        print(f"Title: {title_text}")
        
        # Get a preview of the body text to confirm we aren't blocked by a captcha
        print(f"\nContent Preview:\n{body_text[:500]}...")    
    except Exception as e:
        print(f"\n[!] Error fetching URL: {e}")

if __name__ == "__main__":
    main()
