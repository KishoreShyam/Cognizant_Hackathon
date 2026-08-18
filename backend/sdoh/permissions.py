from rest_framework import permissions

class RolePermission(permissions.BasePermission):
    """
    Custom permission to check Staff roles.
    Allows access if the user's role is in the view's `required_roles` list.
    """
    def has_permission(self, request, view):
        # Must be authenticated (request.user will be populated as a Staff instance by FirebaseAuthentication)
        if not request.user or not request.user.is_authenticated:
            return False
            
        staff = request.user
        
        # Get required roles defined on the view class
        required_roles = getattr(view, 'required_roles', None)
        if not required_roles:
            return True  # If no roles are explicitly required, allow any authenticated staff
            
        return staff.role in required_roles
