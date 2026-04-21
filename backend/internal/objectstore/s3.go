package objectstore

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"

	appconfig "conferenceplatforma/internal/config"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

type S3Store struct {
	client *s3.Client
	bucket string
	prefix string
}

func NewFromConfig(cfg appconfig.Config) (Store, error) {
	if strings.TrimSpace(cfg.ObjectStorageBucket) == "" {
		return nil, ErrNotConfigured
	}

	region := strings.TrimSpace(cfg.ObjectStorageRegion)
	if region == "" {
		region = "us-east-1"
	}

	loadOptions := []func(*awsconfig.LoadOptions) error{
		awsconfig.WithRegion(region),
	}
	if strings.TrimSpace(cfg.ObjectStorageAccessKey) != "" || strings.TrimSpace(cfg.ObjectStorageSecretKey) != "" {
		loadOptions = append(loadOptions,
			awsconfig.WithCredentialsProvider(
				credentials.NewStaticCredentialsProvider(
					cfg.ObjectStorageAccessKey,
					cfg.ObjectStorageSecretKey,
					"",
				),
			),
		)
	}

	awsCfg, err := awsconfig.LoadDefaultConfig(context.Background(), loadOptions...)
	if err != nil {
		return nil, err
	}

	client := s3.NewFromConfig(awsCfg, func(options *s3.Options) {
		options.UsePathStyle = cfg.ObjectStorageUsePathStyle
		if strings.TrimSpace(cfg.ObjectStorageEndpoint) != "" {
			options.BaseEndpoint = aws.String(strings.TrimSpace(cfg.ObjectStorageEndpoint))
		}
	})

	return &S3Store{
		client: client,
		bucket: strings.TrimSpace(cfg.ObjectStorageBucket),
		prefix: strings.Trim(strings.TrimSpace(cfg.ObjectStoragePrefix), "/"),
	}, nil
}

func (s *S3Store) Put(ctx context.Context, key string, body io.Reader, size int64, contentType string) error {
	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(s.bucket),
		Key:           aws.String(s.objectKey(key)),
		Body:          body,
		ContentLength: aws.Int64(size),
		ContentType:   aws.String(contentType),
	})
	return err
}

func (s *S3Store) Get(ctx context.Context, key string) (*Object, error) {
	output, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(s.objectKey(key)),
	})
	if err != nil {
		var noSuchKey *types.NoSuchKey
		if errors.As(err, &noSuchKey) {
			return nil, ErrObjectNotFound
		}
		var apiErr interface{ ErrorCode() string }
		if errors.As(err, &apiErr) && apiErr.ErrorCode() == "NoSuchKey" {
			return nil, ErrObjectNotFound
		}
		return nil, err
	}
	return &Object{
		Body:        output.Body,
		ContentType: aws.ToString(output.ContentType),
		Size:        output.ContentLength,
	}, nil
}

func (s *S3Store) Delete(ctx context.Context, key string) error {
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(s.objectKey(key)),
	})
	return err
}

func (s *S3Store) objectKey(key string) string {
	cleanKey := strings.Trim(strings.TrimSpace(key), "/")
	if s.prefix == "" {
		return cleanKey
	}
	if cleanKey == "" {
		return s.prefix
	}
	return fmt.Sprintf("%s/%s", s.prefix, cleanKey)
}
