from django import template

register = template.Library()


def register_component_tags(templates: list[str]):
    """
    Registers the given component templates as inclusion tags.
    """

    for template_path in templates:
        component_name = template_path.split("/")[-1].replace(".html", "")

        def func(*args, **kwargs): return {}
        func.__name__ = component_name
        print(f"Registering component tag: {component_name} -> {template_path}")
        register.inclusion_tag(template_path)(func)


def get_template_files(dir_name: str) -> list[str]:
    """
    Returns a list of all component template files
    by scanning the 'templates/{dir_name}' directory.
    """
    import os

    base_dir = os.path.dirname(os.path.abspath(__file__))
    templates_dir = os.path.join(base_dir, "..", "templates", dir_name)

    template_files = []
    for filename in os.listdir(templates_dir):
        if filename.endswith(".html"):
            template_files.append(f"{dir_name}/{filename}")

    return template_files


component_templates = get_template_files("log_lens_components")
register_component_tags(component_templates)
