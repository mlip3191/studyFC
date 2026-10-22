from app.config import Settings


def make(**kwargs) -> Settings:
    return Settings(_env_file=None, **kwargs)


def test_placeholder_key_counts_as_missing():
    assert make(anthropic_api_key="your-anthropic-api-key-here").anthropic_api_key == ""


def test_real_key_is_kept_and_trimmed():
    assert make(anthropic_api_key="  sk-ant-abc123 ").anthropic_api_key == "sk-ant-abc123"


def test_other_provider_keys_in_env_file_are_ignored(tmp_path):
    env = tmp_path / ".env"
    env.write_text(
        "OPENAI_API_KEY=x\nXAI_API_KEY=y\nGEMINI_API_KEY=z\nANTHROPIC_API_KEY=k\n",
        encoding="utf-8",
    )
    assert Settings(_env_file=env).anthropic_api_key == "k"
