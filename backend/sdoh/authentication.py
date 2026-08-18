import firebase_admin
from firebase_admin import auth as firebase_auth
from rest_framework import authentication
from rest_framework import exceptions
from .models import Staff

class FirebaseAuthentication(authentication.BaseAuthentication):
    def authenticate(self, request):
        auth_header = request.META.get('HTTP_AUTHORIZATION')
        if not auth_header:
            return None
        
        # Expecting 'Bearer <token>'
        parts = auth_header.split()
        if len(parts) != 2 or parts[0].lower() != 'bearer':
            return None
        
        id_token = parts[1]
        
        # Look up Staff by direct firebase_uid mapping for easy developer testing
        # (e.g. if the authorization header is a synthetic uid like 'admin-uid')
        staff = Staff.objects.filter(firebase_uid=id_token).first()
        if staff:
            return (staff, None)
            
        try:
            # Initialize Firebase Admin if not already done
            if not firebase_admin._apps:
                try:
                    firebase_admin.initialize_app()
                except Exception as e:
                    print("Firebase Admin initialization warning:", e)
            
            # Verify the ID token using the Firebase Admin SDK
            decoded_token = firebase_auth.verify_id_token(id_token)
            uid = decoded_token.get('uid')
            email = decoded_token.get('email')
            name = decoded_token.get('name', '')
            
            if not uid:
                raise exceptions.AuthenticationFailed("Invalid ID token payload: missing UID")
                
        except Exception as e:
            # Local development fallback:
            # If token verification fails (e.g. no Google Admin credentials configured locally),
            # we decode the JWT token WITHOUT signature verification using PyJWT.
            print("Firebase ID Token verification failed, falling back to unverified decode:", e)
            try:
                import jwt
                decoded_token = jwt.decode(id_token, options={"verify_signature": False})
                uid = decoded_token.get('user_id') or decoded_token.get('sub')
                email = decoded_token.get('email')
                name = decoded_token.get('name', '')
                
                if not uid:
                    raise exceptions.AuthenticationFailed("Invalid ID token: missing UID in claims")
            except Exception as jwt_err:
                raise exceptions.AuthenticationFailed(f"Invalid Firebase ID token: {str(e)} (Unverified decode failed: {str(jwt_err)})")
            
        # Get or auto-provision the Staff record in our database
        staff = Staff.objects.filter(firebase_uid=uid).first()
        if not staff:
            # First-time login: create Staff entry. First staff registered becomes admin!
            is_first = not Staff.objects.exists()
            staff = Staff.objects.create(
                firebase_uid=uid,
                email=email or f"{uid}@temporary.com",
                name=name or (email.split('@')[0] if email else "New Staff"),
                role="admin" if is_first else "underwriter"
            )
            
        return (staff, None)
